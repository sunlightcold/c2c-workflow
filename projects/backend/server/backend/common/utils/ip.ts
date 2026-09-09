/* 判断IP是不是内网 */
export function isLAN(ip: string) {
  ip.toLowerCase()
  if (ip === 'localhost') return true
  let a_ip = 0
  if (ip === '') return false
  const aNum = ip.split('.')
  if (aNum.length !== 4) return false
  a_ip += Number.parseInt(aNum[0], 10) << 24
  a_ip += Number.parseInt(aNum[1], 10) << 16
  a_ip += Number.parseInt(aNum[2], 10) << 8
  a_ip += Number.parseInt(aNum[3], 10) << 0
  a_ip = (a_ip >> 16) & 0xffff
  return (
    a_ip >> 8 === 0x7f || a_ip >> 8 === 0xa || a_ip === 0xc0a8 || (a_ip >= 0xac10 && a_ip <= 0xac1f)
  )
}

export async function getIpAddress(ip: string) {
  if (isLAN(ip)) return '内网IP'
  try {
    const buffer = await fetch(`https://whois.pconline.com.cn/ipJson.jsp?ip=${ip}&json=true`, {
      method: 'GET',
    }).then((res) => res.arrayBuffer())
    const jsonStr = new TextDecoder('gbk').decode(buffer)
    const data = JSON.parse(jsonStr)
    return data.addr.trim().split(' ').at(0)
  } catch {
    return '第三方接口请求失败'
  }
}

const v4 =
  '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}'

const v6segment = '[a-fA-F\\d]{1,4}'

const v6 = `
(?:
(?:${v6segment}:){7}(?:${v6segment}|:)|                                    // 1:2:3:4:5:6:7::  1:2:3:4:5:6:7:8
(?:${v6segment}:){6}(?:${v4}|:${v6segment}|:)|                             // 1:2:3:4:5:6::    1:2:3:4:5:6::8   1:2:3:4:5:6::8  1:2:3:4:5:6::1.2.3.4
(?:${v6segment}:){5}(?::${v4}|(?::${v6segment}){1,2}|:)|                   // 1:2:3:4:5::      1:2:3:4:5::7:8   1:2:3:4:5::8    1:2:3:4:5::7:1.2.3.4
(?:${v6segment}:){4}(?:(?::${v6segment}){0,1}:${v4}|(?::${v6segment}){1,3}|:)| // 1:2:3:4::        1:2:3:4::6:7:8   1:2:3:4::8      1:2:3:4::6:7:1.2.3.4
(?:${v6segment}:){3}(?:(?::${v6segment}){0,2}:${v4}|(?::${v6segment}){1,4}|:)| // 1:2:3::          1:2:3::5:6:7:8   1:2:3::8        1:2:3::5:6:7:1.2.3.4
(?:${v6segment}:){2}(?:(?::${v6segment}){0,3}:${v4}|(?::${v6segment}){1,5}|:)| // 1:2::            1:2::4:5:6:7:8   1:2::8          1:2::4:5:6:7:1.2.3.4
(?:${v6segment}:){1}(?:(?::${v6segment}){0,4}:${v4}|(?::${v6segment}){1,6}|:)| // 1::              1::3:4:5:6:7:8   1::8            1::3:4:5:6:7:1.2.3.4
(?::(?:(?::${v6segment}){0,5}:${v4}|(?::${v6segment}){1,7}|:))             // ::2:3:4:5:6:7:8  ::2:3:4:5:6:7:8  ::8             ::1.2.3.4
)(?:%[0-9a-zA-Z]{1,})?                                             // %eth0            %1
`
  .replace(/\s*\/\/.*$/gm, '')
  .replace(/\n/g, '')
  .trim()

export function isIPv46(ip: string) {
  return ipv46RegExp.test(ip)
}

export const ipv46RegExp = new RegExp(`(?:^${v4}$)|(?:^${v6}$)`)
export const ipv4RegExp = new RegExp(v4)
export const ipv6RegExp = new RegExp(v6)
