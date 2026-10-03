export interface UserImportRow {
  row_index: number;
  username: string | null;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
  role: string | null;
  assigned_warehouse: string | null;
  password?: string | null;
  is_valid: boolean;
  errors: string[];
}

export interface UserImportPreviewResponse {
  filename: string;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  rows: UserImportRow[];
}

export interface CreatedUserInfo {
  id: number;
  username: string;
  email: string;
  role: string;
  full_name?: string | null;
  temporary_password?: string | null;
}

export interface RowErrorInfo {
  row_index: number;
  username?: string | null;
  email?: string | null;
  errors: string[];
}

export interface UserImportSummaryResponse {
  total_processed: number;
  success_count: number;
  failed_count: number;
  created_users: CreatedUserInfo[];
  row_errors: RowErrorInfo[];
  message: string;
}
