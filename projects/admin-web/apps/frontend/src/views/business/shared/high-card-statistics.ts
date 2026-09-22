export interface HighCardStatisticTag {
  color: string;
  label: string;
  suffix: string;
  value: number | string;
}

export interface HighCardStatisticItem {
  cardClass: string;
  subTag: HighCardStatisticTag[];
  suffix: string;
  title: string;
  value: number | string;
}

interface OrderStatisticsValue {
  todayPending: { amount: string; count: number };
  todaySuccess: { amount: string; count: number };
  yesterdaySuccess: { amount: string; count: number };
}

export function createOrderStatisticItems(
  statistics?: OrderStatisticsValue,
): HighCardStatisticItem[] {
  return [
    {
      cardClass: 'bg-green-500',
      subTag: [
        {
          color: 'green',
          label: '成功：',
          suffix: ' 单',
          value: statistics?.todaySuccess.count ?? 0,
        },
      ],
      suffix: ' 元',
      title: '今日成功金额',
      value: statistics?.todaySuccess.amount ?? '0.00',
    },
    {
      cardClass: 'bg-blue-500',
      subTag: [
        {
          color: 'blue',
          label: '成功：',
          suffix: ' 单',
          value: statistics?.yesterdaySuccess.count ?? 0,
        },
      ],
      suffix: ' 元',
      title: '昨日成功金额',
      value: statistics?.yesterdaySuccess.amount ?? '0.00',
    },
    {
      cardClass: 'bg-orange-500',
      subTag: [
        {
          color: 'orange',
          label: '待付款：',
          suffix: ' 单',
          value: statistics?.todayPending.count ?? 0,
        },
      ],
      suffix: ' 元',
      title: '今日待付款金额',
      value: statistics?.todayPending.amount ?? '0.00',
    },
  ];
}
