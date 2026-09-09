# Cloudflare R2 反向代理配置

```nginx
location ^~ / {
    proxy_pass             https://oss-cdn.i2tools.com;

    # 强制指定 Host 为真正的上游域名
    proxy_set_header       Host oss-cdn.i2tools.com;

    # 关闭上游的 Keep-Alive，防止复用连接引发 CF 的 421 拦截
    proxy_set_header       Connection "close";

    # 也可以显式声明 HTTP 版本为 1.0 关闭复用特性
    # proxy_http_version     1.0;

    proxy_set_header       X-Real-IP $remote_addr;
    proxy_set_header       X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header       REMOTE-HOST $remote_addr;
    proxy_set_header       X-Forwarded-Proto $scheme;
    proxy_set_header       X-Forwarded-Port $server_port;

    # 必须开启 SNI 且匹配上游 Host
    proxy_ssl_server_name  on;
    proxy_ssl_name         oss-cdn.i2tools.com;
}
```
