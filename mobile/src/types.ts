export interface Account {
  id: number | string;
  name: string;
  type: 'cash' | 'mobile' | 'bank' | string;
  initial_balance: number;
  currency?: string;
}

export interface Transaction {
  id: number | string;
  account_id: number | string;
  category_id: number | string;
  type: 'credit' | 'debit';
  amount: number;
  date: string;
  description?: string;
  reference?: string;
  hash?: string;
}

export interface Category {
  id: number | string;
  name: string;
  group_name?: string;
  icon?: string;
}

export type RootTabParamList = {
  Dashboard: undefined;
  Transactions: undefined;
  NewTransaction: undefined;
  Accounts: undefined;
  Reports: undefined;
};
