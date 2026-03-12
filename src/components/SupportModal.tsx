import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Plus, Search, MessageSquare, Clock, CheckCircle, XCircle, ChevronLeft, Send, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { ticketService, Ticket, TicketStats, TicketMessage } from '../services/ticketService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // New Ticket Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newInitialMessage, setNewInitialMessage] = useState('');

  // Admin State
  const [adminTickets, setAdminTickets] = useState<Ticket[]>([]);
  const [systemEnabled, setSystemEnabled] = useState(true);

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [ticketsData, statsData, settingsData] = await Promise.all([
        ticketService.getTickets(),
        ticketService.getStats(),
        ticketService.getSettings()
      ]);
      setTickets(ticketsData);
      setStats(statsData);
      setSystemEnabled(settingsData.enabled);
    } catch (e) {
      // ignore error
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAdminData = useCallback(async () => {
    if (user?.type !== 'admin') return;
    try {
      const data = await ticketService.adminGetTickets();
      setAdminTickets(data);
    } catch (e) {
      toast({ title: 'Erro', description: 'Erro ao carregar tickets de admin.', variant: 'destructive' });
    }
  }, [user, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (user?.type === 'admin') fetchAdminData();
    }
  }, [isOpen, user, fetchAdminData]);

  const handleCreateTicket = async () => {
    if (!newSubject || !newInitialMessage) {
      toast({ title: 'Erro', description: 'Preencha todos os campos.', variant: 'destructive' });
      return;
    }
    setIsSending(true);
    try {
      await ticketService.createTicket({ subject: newSubject, message: newInitialMessage, priority: newPriority });
      toast({ title: 'Sucesso', description: 'Ticket criado com sucesso.' });
      setIsCreating(false);
      setNewSubject('');
      setNewInitialMessage('');
      fetchData();
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível criar o ticket.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    try {
      const data = await ticketService.getTicket(ticket.id);
      setTicketMessages(data.messages);
    } catch (e) {
      toast({ title: 'Erro', description: 'Erro ao carregar mensagens.', variant: 'destructive' });
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;
    setIsSending(true);
    try {
      await ticketService.sendMessage(selectedTicket.id, newMessage);
      setNewMessage('');
      // Refresh messages
      const data = await ticketService.getTicket(selectedTicket.id);
      setTicketMessages(data.messages);
    } catch (e) {
      toast({ title: 'Erro', description: 'Erro ao enviar mensagem.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (ticketId: number, status: Ticket['status']) => {
    try {
      await ticketService.adminUpdateStatus(ticketId, status);
      toast({ title: 'Atualizado', description: 'Status atualizado.' });
      fetchAdminData();
      fetchData(); // Refresh stats too
      if (selectedTicket?.id === ticketId) {
         setSelectedTicket(prev => prev ? { ...prev, status } : null);
      }
    } catch (e) {
      toast({ title: 'Erro', description: 'Erro ao atualizar status.', variant: 'destructive' });
    }
  };

  const handleToggleSystem = async () => {
    try {
      const next = !systemEnabled;
      await ticketService.updateSettings(next);
      setSystemEnabled(next);
      window.dispatchEvent(new CustomEvent('mediahub:ticketsSettingsChanged', { detail: { enabled: next } }));
      try {
        const settings = await ticketService.getSettings();
        setSystemEnabled(Boolean(settings.enabled));
      } catch (err) {
        console.debug('Erro ao revalidar configuração de tickets');
      }
      toast({ title: 'Sucesso', description: `Sistema ${next ? 'ativado' : 'desativado'}.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Erro ao alterar configuração.', variant: 'destructive' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'resolved': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Aberto';
      case 'in_progress': return 'Em Andamento';
      case 'resolved': return 'Resolvido';
      case 'closed': return 'Fechado';
      default: return status;
    }
  };

  const renderTicketList = (list: Ticket[], isAdmin = false) => (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 p-1">
        {list.map(ticket => (
          <div 
            key={ticket.id} 
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
            onClick={() => handleSelectTicket(ticket)}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{ticket.subject}</span>
                <Badge variant="outline" className={getStatusColor(ticket.status)}>
                  {getStatusLabel(ticket.status)}
                </Badge>
                {isAdmin && <span className="text-xs text-muted-foreground">User: {ticket.user_email}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                #{ticket.id} • {format(new Date(ticket.updated_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            Nenhum ticket encontrado.
          </div>
        )}
      </div>
    </ScrollArea>
  );

  if (!systemEnabled && user?.type !== 'admin' && !isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="h-5 w-5" />
              Suporte Indisponível
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center text-muted-foreground">
            <p>O sistema de tickets está temporariamente desativado para manutenção.</p>
            <p className="text-sm mt-2">Por favor, tente novamente mais tarde.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <div className="p-6 pb-2 border-b">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center justify-between">
              <span>Central de Suporte</span>
              {user?.type === 'admin' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">Status do Sistema:</span>
                  <Button 
                    variant={systemEnabled ? "default" : "destructive"} 
                    size="sm" 
                    onClick={handleToggleSystem}
                  >
                    {systemEnabled ? 'Ativo (Clique para Desativar)' : 'Desativado (Clique para Ativar)'}
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-6 pt-4">
          {selectedTicket ? (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(null)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{selectedTicket.subject}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>#{selectedTicket.id}</span>
                    <span>•</span>
                    <Badge variant="secondary" className={getStatusColor(selectedTicket.status)}>
                      {getStatusLabel(selectedTicket.status)}
                    </Badge>
                  </div>
                </div>
                {user?.type === 'admin' && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedTicket.id, 'in_progress')}>Andamento</Button>
                    <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}>Resolver</Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedTicket.id, 'closed')}>Fechar</Button>
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1 border rounded-md p-4 mb-4 bg-accent/20">
                <div className="space-y-4">
                  {ticketMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col ${msg.user_id === user?.id ? 'items-end' : 'items-start'}`}
                    >
                      <div 
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.user_id === user?.id 
                            ? 'bg-primary text-primary-foreground' 
                            : msg.is_admin 
                              ? 'bg-destructive/10 border border-destructive/20' 
                              : 'bg-muted'
                        }`}
                      >
                        {msg.is_admin && msg.user_id !== user?.id && (
                          <p className="text-xs font-bold mb-1 text-destructive">Suporte</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(msg.created_at), "dd/MM HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Input 
                  placeholder="Digite sua resposta..." 
                  value={newMessage} 
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  disabled={isSending || selectedTicket.status === 'closed'}
                />
                <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim() || selectedTicket.status === 'closed'}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : isCreating ? (
             <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-200">
               <div className="flex items-center gap-2 mb-6">
                 <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>
                   <ChevronLeft className="h-4 w-4 mr-1" /> Cancelar
                 </Button>
                 <h3 className="font-bold text-lg">Novo Ticket</h3>
               </div>
               
               <div className="space-y-4 max-w-lg mx-auto w-full">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Assunto</label>
                   <Input 
                     placeholder="Resumo do problema" 
                     value={newSubject}
                     onChange={(e) => setNewSubject(e.target.value)}
                   />
                 </div>
                 
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Prioridade</label>
                   <div className="flex gap-2">
                     {['low', 'medium', 'high'].map(p => (
                       <Button 
                         key={p} 
                         variant={newPriority === p ? 'default' : 'outline'} 
                         size="sm"
                         onClick={() => setNewPriority(p)}
                         className="capitalize"
                       >
                         {p === 'low' ? 'Baixa' : p === 'medium' ? 'Média' : 'Alta'}
                       </Button>
                     ))}
                   </div>
                 </div>

                 <div className="space-y-2">
                   <label className="text-sm font-medium">Mensagem</label>
                   <textarea 
                     className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                     placeholder="Descreva seu problema detalhadamente..."
                     value={newInitialMessage}
                     onChange={(e) => setNewInitialMessage(e.target.value)}
                   />
                 </div>

                 <Button className="w-full" onClick={handleCreateTicket} disabled={isSending}>
                   {isSending ? 'Criando...' : 'Abrir Ticket'}
                 </Button>
               </div>
             </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <TabsList>
                  <TabsTrigger value="tickets">Meus Tickets</TabsTrigger>
                  {user?.type === 'admin' && <TabsTrigger value="admin">Administração</TabsTrigger>}
                </TabsList>
                
                {activeTab === 'tickets' && (systemEnabled || user?.type === 'admin') && (
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Abrir Ticket
                </Button>
              )}
              </div>

              {!systemEnabled && user?.type !== 'admin' && (
                <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-lg mb-4 text-yellow-800 dark:text-yellow-200 text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  O sistema de tickets está temporariamente desativado para novos chamados.
                </div>
              )}

              {stats && activeTab === 'tickets' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 text-2xl font-bold">{stats.total}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-red-500">Abertos</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 text-2xl font-bold">{stats.open}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-yellow-500">Em Andamento</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 text-2xl font-bold">{stats.in_progress}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-green-500">Resolvidos</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 text-2xl font-bold">{stats.resolved}</CardContent>
                  </Card>
                </div>
              )}

              <TabsContent value="tickets" className="flex-1 mt-0">
                {renderTicketList(tickets)}
              </TabsContent>
              
              {user?.type === 'admin' && (
                <TabsContent value="admin" className="flex-1 mt-0">
                  {renderTicketList(adminTickets, true)}
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SupportModal;
