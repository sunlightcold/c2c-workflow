# 时区污染窗口修复脚本说明

脚本文件：`scripts/fix-timestamp-window-offset.ts`

## 1. 解决的问题

用于修复以下场景：

1. 某个时间窗口内，`timestamp without time zone` 字段被错误当作本地时间处理，导致整体偏移（典型为 `-8h`）。
2. 需要批量修复多表，同时保留可回滚能力。

## 2. 修复规则（当前实现）

脚本只处理满足下面条件的数据：

1. 只扫描 `timestamp without time zone` 类型列。
2. 只处理包含 `createdAt` 列的表（`createdAt` 作为锚点）。
3. 只更新 `createdAt BETWEEN [start, end]` 的行。
4. 对这些行中的每个时间列，仅当“该列值本身也在 `[start, end]`”时，才执行减小时差操作。

默认窗口与偏移：

1. `start = 2026-04-27 04:00:00`
2. `end = 2026-04-29 01:31:00`
3. `offsetHours = 8`（即减 8 小时）

## 3. 执行方式

### 3.1 先预演（必须）

```bash
pnpm --dir server/backend exec ts-node -r tsconfig-paths/register scripts/fix-timestamp-window-offset.ts --dry-run
```

输出会包含：

1. `affectedTables` / `affectedRowsTotal`
2. 每张表的 `affectedByColumn`
3. 即将创建的 `backupTable` 名称

### 3.2 正式执行

```bash
pnpm --dir server/backend exec ts-node -r tsconfig-paths/register scripts/fix-timestamp-window-offset.ts --execute --backup-suffix=fix_all_window_20260429_v2
```

建议始终显式传 `--backup-suffix`，确保一次执行对应一组可识别备份。

## 4. 备份表如何生成

每张命中表会先创建备份表，然后再更新原表。执行顺序在同一事务内：

1. `CREATE TABLE <backup> AS SELECT * FROM <source> WHERE createdAt BETWEEN ...`
2. `UPDATE <source> SET ... WHERE createdAt BETWEEN ...`

命名规则：

1. `<原表名>__tzfix_bak_<backupSuffix>_<fingerprint>`
2. `fingerprint` 是按原表名计算的短哈希，用于避免 PostgreSQL 63 字符表名截断导致重名。

示例：

1. `public.app_trade_order__tzfix_bak_fix_all_window_20260429_v2_6z9uvp`

## 5. 如何用备份表回滚

按字段回滚（推荐），不要整表覆盖：

```sql
UPDATE app_trade_order cur
SET "paidAt" = bak."paidAt"
FROM public."app_trade_order__tzfix_bak_fix_all_window_20260429_v2_6z9uvp" bak
WHERE cur."id" = bak."id"
  AND cur."paidAt" IS DISTINCT FROM bak."paidAt";
```

回滚前建议先做差异检查：

```sql
SELECT COUNT(*)
FROM app_trade_order cur
JOIN public."app_trade_order__tzfix_bak_fix_all_window_20260429_v2_6z9uvp" bak
  ON cur."id" = bak."id"
WHERE cur."paidAt" IS DISTINCT FROM bak."paidAt";
```

## 6. 备份表何时删除、如何删除

建议在满足以下条件后再删除备份：

1. 业务接口核验通过（时间显示、排序、统计都正常）。
2. 关键表抽样比对通过（当前值与备份差异符合预期）。
3. 至少保留一个可接受的观察期（如 24~72 小时）。

先列出备份表：

```sql
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%__tzfix_bak_fix_all_window_20260429_v2%';
```

确认后删除（逐张执行，避免误删）：

```sql
DROP TABLE public."app_trade_order__tzfix_bak_fix_all_window_20260429_v2_6z9uvp";
```

## 7. 风险与注意事项

1. 该脚本不是幂等脚本，不要对同一窗口重复执行 `--execute`。
2. 如果必须重跑，请更换窗口并重新 dry-run 确认。
3. 生产执行前必须先在同版本数据库上完整预演并留存输出。
