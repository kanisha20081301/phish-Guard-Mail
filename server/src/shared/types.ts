export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'USER' | 'ANALYST' | 'ADMIN';
}

export interface ApiErrorResponse {
  error: string;
  requestId: string;
}
