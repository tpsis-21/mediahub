
import React from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { ScrollArea } from './ui/scroll-area';

interface TermsModalProps {
  onClose: () => void;
}

const TermsModal: React.FC<TermsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Termos de Uso e Política de Privacidade</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[70vh] pr-4">
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-3">Termos de Uso - Capture Capas</h3>
                
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-medium mb-2">1. Aceitação dos Termos</h4>
                    <p>Ao utilizar o Capture Capas, você concorda com estes termos de uso e nossa política de privacidade.</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">2. Descrição do Serviço</h4>
                    <p>O Capture Capas é uma aplicação que permite buscar e baixar capas de filmes e séries utilizando a API do TMDB (The Movie Database).</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">3. Limitações de Uso</h4>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Usuários visitantes: máximo 3 buscas por dia</li>
                      <li>Usuários gratuitos: buscas ilimitadas, recursos básicos</li>
                      <li>Usuários premium: acesso completo a todos os recursos</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">4. Propriedade Intelectual</h4>
                    <p>As imagens disponibilizadas são fornecidas pelo TMDB e estão sujeitas aos termos de uso deles. Você deve respeitar os direitos autorais das imagens baixadas.</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">5. Dados da Marca</h4>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Nome da marca e logo podem ser alterados no máximo 2 vezes</li>
                      <li>Após as 2 alterações, há período de carência de 15 dias entre mudanças</li>
                      <li>Dados da marca são utilizados apenas para personalização da interface</li>
                    </ul>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-semibold mb-3">Política de Privacidade</h3>
                
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-medium mb-2">1. Coleta de Dados</h4>
                    <p>Coletamos apenas os dados necessários para o funcionamento do serviço:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Nome completo</li>
                      <li>E-mail</li>
                      <li>Telefone WhatsApp</li>
                      <li>Dados da marca (nome, logo, cores)</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">2. Uso dos Dados</h4>
                    <p>Seus dados são utilizados exclusivamente para:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Autenticação e acesso ao sistema</li>
                      <li>Personalização da interface com sua marca</li>
                      <li>Controle de limites de uso</li>
                      <li>Comunicação sobre o serviço</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">3. Armazenamento</h4>
                    <p>Os dados são armazenados de forma segura e não são compartilhados com terceiros, exceto quando necessário para o funcionamento do serviço (ex: processamento de pagamentos).</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">4. Direitos do Usuário</h4>
                    <p>Você tem direito a:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Acessar seus dados pessoais</li>
                      <li>Corrigir informações incorretas</li>
                      <li>Solicitar exclusão de sua conta</li>
                      <li>Portabilidade dos dados</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">5. Cookies e Tecnologias</h4>
                    <p>Utilizamos localStorage para manter suas preferências e sessão. Não utilizamos cookies de terceiros para rastreamento.</p>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-semibold mb-3">Contato</h3>
                <p className="text-sm">
                  Para dúvidas sobre estes termos ou nossa política de privacidade, 
                  entre em contato através do nosso suporte.
                </p>
              </section>
              
              <div className="text-xs text-gray-500 pt-4 border-t">
                <p>Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsModal;
