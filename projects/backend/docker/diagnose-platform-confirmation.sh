#!/bin/sh

set -eu

usage() {
  echo "用法: sh ./diagnose-platform-confirmation.sh <系统单号|订单ID|商家订单号|上游流水号> [env文件]" >&2
  echo "示例: sh ./diagnose-platform-confirmation.sh PAY202609170001 .env" >&2
}

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage
  exit 2
fi

identifier=$1
env_file=${2:-.env}
compose_file=${C2C_COMPOSE_FILE:-compose.yaml}

if [ ! -f "$compose_file" ]; then
  echo "错误: 找不到 Compose 文件: $compose_file" >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "错误: 找不到环境文件: $env_file" >&2
  exit 1
fi

if ! docker compose --env-file "$env_file" -f "$compose_file" ps --status running postgres \
  | grep -q postgres; then
  echo "错误: PostgreSQL 容器未运行，请先启动项目。" >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=identifier="$1"' \
  sh "$identifier" <<'SQL'
\pset pager off
\pset null 'NULL'
\x on

SELECT
  p.id AS "支付订单ID",
  p."paymentNo" AS "支付单号",
  p."sourceBusinessNo" AS "商家订单号",
  p."upstreamId" AS "支付上游流水号",
  merchant.code AS "商家编号",
  merchant.platform AS "平台",
  p.status AS "支付订单状态",
  p."sourceType" AS "订单来源",
  p."platformConfirmStatus" AS "标记付款状态",
  p."platformConfirmAttempts" AS "标记尝试次数",
  p."platformConfirmLastAttemptAt" AT TIME ZONE 'Asia/Shanghai' AS "最后尝试时间_北京时间",
  p."platformConfirmedAt" AT TIME ZONE 'Asia/Shanghai' AS "确认成功时间_北京时间",
  p."platformConfirmLastError" AS "标记付款最后错误",
  p."lastError" AS "支付订单最后错误",
  merchant_order.status AS "商家订单状态",
  merchant_order."platformStatus" AS "上游订单状态",
  merchant_order."platformPaymentMethodId" AS "上游付款方式ID",
  merchant."paidConfirmNextAt" AT TIME ZONE 'Asia/Shanghai' AS "欧易下次可标记时间_北京时间",
  merchant."paidConfirmLockUntil" AT TIME ZONE 'Asia/Shanghai' AS "欧易标记锁到期时间_北京时间",
  payment_batch."batchNo" AS "支付批次号",
  payment_batch."upstreamId" AS "批次上游流水号",
  payment_batch_item."upstreamId" AS "批次明细上游流水号",
  payment_batch.status AS "支付批次状态",
  CASE
    WHEN p.status <> 'SUCCESS' THEN '不会执行：支付订单尚未成功'
    WHEN p."sourceType" <> 'C2C_BUY' THEN '不会执行：不是 C2C 买币订单'
    WHEN p."platformConfirmStatus" = 'NOT_REQUIRED' THEN '不会执行：该订单不需要平台标记付款'
    WHEN p."platformConfirmStatus" = 'PENDING' THEN '等待执行：15 秒补偿任务会认领并调用标记付款'
    WHEN p."platformConfirmStatus" = 'PROCESSING'
      AND p."platformConfirmLastAttemptAt" <= NOW() - INTERVAL '60 seconds'
      THEN '处理中已超过 60 秒：15 秒补偿任务只查询上游状态，不会重复标记付款'
    WHEN p."platformConfirmStatus" = 'PROCESSING' THEN '正在执行：请求可能仍在进行或等待欧易节流锁'
    WHEN p."platformConfirmStatus" = 'FAILED' THEN '执行失败：不会自动重试，需要人工重试；查看标记付款最后错误'
    WHEN p."platformConfirmStatus" = 'SUCCESS' THEN '执行完成：平台标记付款成功'
    ELSE '未知状态：需要检查数据'
  END AS "诊断结论"
FROM payment_order AS p
INNER JOIN merchant
  ON merchant.id = p."merchantId"
 AND merchant."tenantId" = p."tenantId"
LEFT JOIN merchant_order
  ON merchant_order."tenantId" = p."tenantId"
 AND merchant_order."merchantId" = p."merchantId"
 AND merchant_order."platformOrderId" = p."sourceBusinessNo"
LEFT JOIN payment_batch_item
  ON payment_batch_item."tenantId" = p."tenantId"
 AND payment_batch_item."merchantId" = p."merchantId"
 AND payment_batch_item."paymentOrderId" = p.id
LEFT JOIN payment_batch
  ON payment_batch.id = payment_batch_item."batchId"
 AND payment_batch."tenantId" = payment_batch_item."tenantId"
WHERE p."paymentNo" = :'identifier'
   OR p.id::text = :'identifier'
   OR p."sourceBusinessNo" = :'identifier'
   OR p."upstreamId" = :'identifier'
   OR payment_batch."batchNo" = :'identifier'
   OR payment_batch."upstreamId" = :'identifier'
   OR payment_batch_item."upstreamId" = :'identifier'
ORDER BY p."createdAt" DESC;

\x off

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM payment_order AS matched_payment
      LEFT JOIN payment_batch_item AS matched_item
        ON matched_item."paymentOrderId" = matched_payment.id
      LEFT JOIN payment_batch AS matched_batch
        ON matched_batch.id = matched_item."batchId"
      WHERE matched_payment."paymentNo" = :'identifier'
         OR matched_payment.id::text = :'identifier'
         OR matched_payment."sourceBusinessNo" = :'identifier'
         OR matched_payment."upstreamId" = :'identifier'
         OR matched_batch."batchNo" = :'identifier'
         OR matched_batch."upstreamId" = :'identifier'
         OR matched_item."upstreamId" = :'identifier'
    ) THEN '查询完成'
    ELSE '没有找到订单，请确认支付单号、支付订单ID或商家订单号'
  END AS "结果";
SQL
