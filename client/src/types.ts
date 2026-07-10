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
    itemForecasts: Record<number, { start: string; end: string }>;
  };
};
