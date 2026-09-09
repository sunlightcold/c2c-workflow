export interface PayModeProps {
  options: { label: string; value: string }[];
  disabled?: boolean;
  addBtnText?: string;
}

export interface PayModeItem {
  payMode: string;
  payCode: string;
}
