export type Status = 'open' | 'active' | 'done';
export type ItemType = 'delivery' | 'work';

export type PlanItem = {
  id: number;
  project_id: number;
  type: ItemType;
  title: string;
  partner: string;
  start_date: string;
  end_date: string;
  status: Status;
  schedule_mode: 'auto' | 'fixed';
  extension_days: number;
  extension_reason: string;
  notes: string;
  sort_order: number;
  dependency_ids: number[];
};

export type Project = {
  id: number;
  name: string;
  customer: string;
  target_date: string;
  color: string;
  notes: string;
  archived: number;
  items: PlanItem[];
  forecast: {
    completion: string;
    conflicts: number[];
    itemForecasts: Record<number, {
      start: string;
      end: string;
      base_end: string;
      required_start: string;
      shifted: boolean;
      conflict: boolean;
    }>;
  };
};
