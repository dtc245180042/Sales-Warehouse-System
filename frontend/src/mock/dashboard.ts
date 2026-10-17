export interface RevenueMonthPoint {
  month: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface DailyPoint {
  day: string;
  revenue: number;
  orders: number;
}

export const monthlyRevenueData: RevenueMonthPoint[] = [];
export const dailyRevenueData: DailyPoint[] = [];
export const categoryDistribution: { name: string; value: number; color: string }[] = [];
export const recentActivities: { id: string; user: string; action: string; time: string; type: string }[] = [];
