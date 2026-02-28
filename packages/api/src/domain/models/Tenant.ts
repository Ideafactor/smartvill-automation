export interface Tenant {
  id: string;
  name: string;
  businessNumber: string; // 사업자등록번호
  email: string;
  schemaName: string; // tenant_{id}
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantInput {
  name: string;
  businessNumber: string;
  email: string;
  adminPassword: string;
}
