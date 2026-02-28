export type CertificateStatus = 'active' | 'expired' | 'pending' | 'invalid';

export interface Certificate {
  id: string;
  tenantId: string;
  accountId: string;
  subjectDn: string;       // 인증서 소유자 DN
  issuerDn: string;        // 발급기관 DN
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  status: CertificateStatus;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}
