[CmdletBinding()]
param(
  [ValidateRange(0, 500)]
  [int]$Count = 5,

  [ValidatePattern('^https?://')]
  [string]$BaseUrl = "http://127.0.0.1:13002",

  [ValidateNotNullOrEmpty()]
  [string]$ExternalMerchantId = "mock-hq-binance"
)

$ErrorActionPreference = "Stop"
$mockBaseUrl = $BaseUrl.TrimEnd("/")
$healthUrl = "$mockBaseUrl/api/mock/health"
$ordersUrl = "$mockBaseUrl/api/mock/binance-c2c/orders"
$resetUrl = "$mockBaseUrl/api/mock/binance-c2c/reset"

try {
  $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 5
  if (-not $health) {
    throw "empty health response"
  }
}
catch {
  throw "Binance Mock is unavailable at $mockBaseUrl. Start it with 'pnpm run dev:mock' first."
}

# Reset clears only the Binance C2C in-memory orders and restores its Mock settings.
$null = Invoke-RestMethod -Uri $resetUrl -Method Post -TimeoutSec 10

$now = [DateTimeOffset]::Now
$runId = [Guid]::NewGuid().ToString("N").Substring(0, 6).ToUpperInvariant()
$orderPrefix = "MOCK-BN-$($now.ToString('yyyyMMddHHmmssfff'))-$runId"
$culture = [Globalization.CultureInfo]::InvariantCulture
$created = @()

for ($index = 1; $index -le $Count; $index += 1) {
  $createdAt = $now.AddSeconds(-(($index - 1) * 3))
  $totalPrice = ([decimal]100 + ([decimal]$index * [decimal]17.35)).ToString("0.00", $culture)
  $amount = ([decimal]::Parse($totalPrice, $culture) / [decimal]7.20).ToString("0.00000000", $culture)
  $orderNumber = "$orderPrefix-$($index.ToString('D3'))"
  $payAccount = "binance-mock-$($index.ToString('D3'))@example.com"
  $body = [ordered]@{
    externalMerchantId = $ExternalMerchantId
    orderNumber = $orderNumber
    orderStatus = 1
    totalPrice = $totalPrice
    amount = $amount
    asset = "USDT"
    fiat = "CNY"
    fiatUnit = "CNY"
    tradeType = "BUY"
    createTime = $createdAt.ToString("o")
    updateTime = $createdAt.ToString("o")
    paymentDeadline = $createdAt.AddMinutes(15).ToString("o")
    realName = "测试用户"
    kycStatus = "PASS"
    selectedPayId = "1"
    paymentMethod = [ordered]@{
      id = "1"
      identifier = "ALIPAY"
      tradeMethodName = "支付宝"
      payAccount = $payAccount
      fieldList = @(
        [ordered]@{ fieldName = "account_name"; fieldValue = "测试用户" }
        [ordered]@{ fieldName = "alipay_account"; fieldValue = $payAccount }
      )
    }
  }
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  $request = @{
    Uri = $ordersUrl
    Method = "Post"
    ContentType = "application/json; charset=utf-8"
    Body = [Text.Encoding]::UTF8.GetBytes($json)
    TimeoutSec = 10
  }
  $response = Invoke-RestMethod @request
  $created += [pscustomobject]@{
    OrderNumber = $response.orderNumber
    Amount = "$($response.totalPrice) $($response.fiat)"
    Status = $response.orderStatus
    PaymentMethod = $response.payMethods[0].tradeMethodName
  }
}

$orders = Invoke-RestMethod -Uri $ordersUrl -Method Get -TimeoutSec 10
$actualCount = if ($null -eq $orders) { 0 } else { $orders.Count }
if ($actualCount -ne $Count) {
  throw "Binance Mock verification failed: expected $Count orders, received $actualCount."
}

Write-Host "Binance Mock reset completed: $Count order(s) for $ExternalMerchantId." -ForegroundColor Green
$created | Format-Table -AutoSize
