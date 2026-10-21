export type SignupTag = 'weekly-niches' | 'app-updates' | 'launch-coupons';
export interface Signup {
  email: string;
  first_name?: string;
  source: string;
  episode?: string;
  tags: SignupTag[];
}
