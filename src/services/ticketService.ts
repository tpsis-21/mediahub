import { apiRequest } from './apiClient';

export interface Ticket {
  id: number;
  user_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
  user_email?: string;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  user_id: string;
  message: string;
  is_admin: boolean;
  created_at: string;
  user_email?: string;
}

export interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
}

export const ticketService = {
  getSettings: () => apiRequest<{ enabled: boolean }>({ path: '/api/tickets/settings' }),
  
  getTickets: () => apiRequest<Ticket[]>({ path: '/api/tickets', auth: true }),
  
  createTicket: (data: { subject: string; message: string }) => 
    apiRequest<{ id: number }>({ path: '/api/tickets', method: 'POST', body: data, auth: true }),
    
  getTicket: (id: number) => 
    apiRequest<{ ticket: Ticket; messages: TicketMessage[] }>({ path: `/api/tickets/${id}`, auth: true }),
    
  sendMessage: (id: number, message: string) => 
    apiRequest<{ success: boolean }>({ path: `/api/tickets/${id}/messages`, method: 'POST', body: { message }, auth: true }),
    
  getStats: () => apiRequest<TicketStats>({ path: '/api/tickets/stats', auth: true }),

  // Admin
  updateSettings: (enabled: boolean) => 
    apiRequest<{ success: boolean }>({ path: '/api/admin/tickets/settings', method: 'PUT', body: { enabled }, auth: true }),
    
  adminGetTickets: () => apiRequest<Ticket[]>({ path: '/api/admin/tickets', auth: true }),
  
  adminUpdateStatus: (id: number, status: string) => 
    apiRequest<{ success: boolean }>({ path: `/api/admin/tickets/${id}/status`, method: 'PUT', body: { status }, auth: true }),
};
