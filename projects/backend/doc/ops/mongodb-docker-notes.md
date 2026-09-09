# MongoDB 与 Docker 记录

## MongoDB 常用命令

```mongosh
db.collectionName.getIndexes()
db.collectionName.dropIndex("email_1")
db.collectionName.dropIndex({ email: 1 })
db.dropDatabase()
db.collectionName.updateOne({ nickname: 'superAdmin' }, { $set: { bindOtp: false } })
db.collectionName.find()
```

## Docker Compose

```bash
docker compose up -d
docker compose up -d --build
docker compose down
```
