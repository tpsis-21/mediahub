
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header";
import TermsModal from "../components/TermsModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { Archive, ArrowRight, BadgeCheck, Crown, Layers, Palette, Send, Sparkles, Wand2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [showTermsModal, setShowTermsModal] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/app', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const openAuth = () => {
    window.dispatchEvent(new Event('mediahub:openAuthModal'));
  };

  const examples = [
    {
      title: "Banner Story",
      badge: "Vertical",
      ratioClassName: "aspect-[9/16]",
      imageUrl: new URL("../../anexos/photo_2026-02-19_12-13-27.jpg", import.meta.url).href,
      alt: "Screenshot de banner vertical gerado pela aplicação",
    },
    {
      title: "Banner Quadrado",
      badge: "1:1",
      ratioClassName: "aspect-square",
      imageUrl: new URL("../../anexos/photo_2026-02-21_08-45-13.jpg", import.meta.url).href,
      alt: "Screenshot de banner quadrado gerado pela aplicação",
    },
    {
      title: "Top 10",
      badge: "Premium",
      ratioClassName: "aspect-square",
      imageUrl: new URL("../../anexos/top5.jpg", import.meta.url).href,
      alt: "Screenshot de ranking Top 10 gerado pela aplicação",
    },
    {
      title: "Identidade da marca",
      badge: "Branding",
      ratioClassName: "aspect-[16/9]",
      imageUrl: new URL("../../anexos/ideia modelo vertical.jpg", import.meta.url).href,
      alt: "Screenshot de tela de branding e identidade visual gerada pela aplicação",
    },
    {
      title: "Export em lote",
      badge: "ZIP",
      ratioClassName: "aspect-[3/2]",
      imageUrl: new URL("../../anexos/photo_2026-02-28_18-15-01.jpg", import.meta.url).href,
      alt: "Screenshot de exportação em lote gerada pela aplicação",
    },
    {
      title: "Envio",
      badge: "Telegram",
      ratioClassName: "aspect-[16/9]",
      imageUrl: new URL("../../anexos/top5 (2).jpg", import.meta.url).href,
      alt: "Screenshot de prévia de envio gerada pela aplicação",
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section id="home" className="space-y-10">
          <div className="relative overflow-hidden rounded-lg border bg-card p-6 sm:p-10 glass-effect">
            <div className="absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_top,white,transparent_55%)]">
              <div className="h-full w-full bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500" />
            </div>

            <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Comece grátis</Badge>
                  <Badge variant="outline">Seu workspace por conta</Badge>
                </div>

                <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">
                  MediaHub: artes prontas para publicar em poucos cliques
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
                  Busque títulos, selecione itens e exporte com consistência. Baixe capas, gere banners em lote e mantenha o padrão da sua marca.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <Button type="button" onClick={openAuth} className="gap-2 sm:w-auto">
                    Criar conta grátis
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button asChild variant="outline" className="sm:w-auto">
                    <a href="#features">Ver recursos</a>
                  </Button>
                  <Button asChild variant="ghost" className="sm:w-auto">
                    <a href="#examples">Ver exemplos</a>
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  O uso acontece dentro da sua conta para manter histórico e configurações da marca.
                </div>
              </div>

              <div className="hidden lg:block">
                <div className="rounded-2xl border bg-background/40 p-4">
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium leading-tight">Banner pronto</div>
                          <div className="text-xs text-muted-foreground">Modelos + sua marca</div>
                        </div>
                      </div>
                      <Badge variant="secondary">Preview</Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="aspect-[9/16] rounded-lg bg-gradient-to-br from-blue-600/25 via-violet-600/20 to-fuchsia-600/25 border" />
                      <div className="aspect-[9/16] rounded-lg bg-gradient-to-br from-emerald-600/20 via-sky-600/20 to-indigo-600/25 border" />
                      <div className="aspect-[9/16] rounded-lg bg-gradient-to-br from-amber-600/20 via-rose-600/20 to-purple-600/25 border" />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Archive className="h-4 w-4" />
                          ZIP em lote
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Organize e baixe de uma vez</div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Send className="h-4 w-4" />
                          Envio
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Exporte por download ou Telegram</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section aria-label="Diferenciais do MediaHub" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="glass-effect">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <BadgeCheck className="h-4 w-4" />
                  Fluxo simples
                </div>
                <div className="text-sm text-muted-foreground">Do título ao material final sem retrabalho.</div>
              </CardContent>
            </Card>
            <Card className="glass-effect">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="h-4 w-4" />
                  Em lote
                </div>
                <div className="text-sm text-muted-foreground">Selecione vários e exporte tudo em um ZIP.</div>
              </CardContent>
            </Card>
            <Card className="glass-effect">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Palette className="h-4 w-4" />
                  Sua marca
                </div>
                <div className="text-sm text-muted-foreground">Cores, logo e contatos nos banners.</div>
              </CardContent>
            </Card>
            <Card className="glass-effect">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Crown className="h-4 w-4" />
                  Premium
                </div>
                <div className="text-sm text-muted-foreground">Busca em massa e geração avançada de banners.</div>
              </CardContent>
            </Card>
          </section>

          <section aria-label="Para quem é" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Feito para quem publica com frequência</h2>
              <p className="text-sm text-muted-foreground">
                Se você precisa de velocidade e padrão visual, o MediaHub encaixa no seu fluxo.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="font-medium">Páginas e perfis</div>
                  <div className="text-sm text-muted-foreground">Rotina de posts com consistência de marca.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="font-medium">Comunidades</div>
                  <div className="text-sm text-muted-foreground">Curadoria e indicações com artes prontas.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="font-medium">Equipes de social</div>
                  <div className="text-sm text-muted-foreground">Menos retrabalho para montar lotes e exportar.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="font-medium">Ações sazonais</div>
                  <div className="text-sm text-muted-foreground">Rankings, listas e coleções em formatos prontos.</div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-label="Problema e solução" className="grid gap-4 lg:grid-cols-2">
            <Card className="glass-effect">
              <CardHeader>
                <CardTitle className="text-lg">O problema</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                  <li>Perder tempo montando artes manualmente.</li>
                  <li>Baixar item por item e renomear arquivos.</li>
                  <li>Marca sem padrão (cores, logo e contato variando).</li>
                  <li>Refazer o mesmo processo toda vez que vai publicar.</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="glass-effect">
              <CardHeader>
                <CardTitle className="text-lg">Com o MediaHub</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                  <li>Busque, selecione e exporte em poucos cliques.</li>
                  <li>Baixe imagens e gere banners em lote (ZIP).</li>
                  <li>Personalize com sua marca e informações de contato.</li>
                  <li>Envie por download ou Telegram, quando preferir.</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          <section aria-label="Como funciona" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">Como funciona na prática</h2>
                <p className="text-sm text-muted-foreground">Um fluxo curto para você produzir e publicar mais rápido.</p>
              </div>
              {!user && (
                <Button variant="outline" type="button" onClick={openAuth} className="hidden sm:inline-flex">
                  Criar conta
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="text-xs text-muted-foreground">Passo 1</div>
                  <div className="font-medium">Crie sua conta</div>
                  <div className="text-sm text-muted-foreground">A conta guarda seu histórico e suas preferências.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="text-xs text-muted-foreground">Passo 2</div>
                  <div className="font-medium">Busque e selecione</div>
                  <div className="text-sm text-muted-foreground">Escolha os itens e monte seu lote.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="text-xs text-muted-foreground">Passo 3</div>
                  <div className="font-medium">Gere suas artes</div>
                  <div className="text-sm text-muted-foreground">Banners e variações seguindo sua identidade.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="text-xs text-muted-foreground">Passo 4</div>
                  <div className="font-medium">Exporte e publique</div>
                  <div className="text-sm text-muted-foreground">Download ou envio para o Telegram.</div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="features" aria-label="Recursos" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Tudo que você precisa, em um lugar</h2>
              <p className="text-sm text-muted-foreground">Recursos focados em velocidade, padrão visual e export fácil.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Wand2 className="h-4 w-4" />
                    Banner profissional
                  </div>
                  <div className="text-sm text-muted-foreground">Templates e opções de formato para publicar com consistência.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Palette className="h-4 w-4" />
                    Branding
                  </div>
                  <div className="text-sm text-muted-foreground">Use cores, logo e contatos para manter sua identidade.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Archive className="h-4 w-4" />
                    ZIP em lote
                  </div>
                  <div className="text-sm text-muted-foreground">Baixe várias capas ou banners em um único arquivo.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Crown className="h-4 w-4" />
                    Top 10 (Premium)
                  </div>
                  <div className="text-sm text-muted-foreground">Gere modelos de ranking prontos para postagem.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Send className="h-4 w-4" />
                    Envio para Telegram
                  </div>
                  <div className="text-sm text-muted-foreground">Exporte e envie com legenda e sinopse, quando fizer sentido.</div>
                </CardContent>
              </Card>
              <Card className="glass-effect">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-4 w-4" />
                    Vídeo Branding (beta)
                  </div>
                  <div className="text-sm text-muted-foreground">Gere variações em vídeo com elementos da sua marca.</div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="examples" aria-label="Galeria de exemplos" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Galeria de exemplos</h2>
              <p className="text-sm text-muted-foreground">
                Exemplos reais gerados pela aplicação (sem dados sensíveis).
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {examples.map((example) => (
                <Card key={example.title} className="glass-effect">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{example.title}</div>
                      <Badge variant="secondary">{example.badge}</Badge>
                    </div>
                    <div className={example.ratioClassName}>
                      <img
                        src={example.imageUrl}
                        alt={example.alt}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full rounded-xl border object-cover"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section id="pricing" aria-label="Plano" className="grid gap-4 lg:grid-cols-2">
            <Card className="glass-effect lg:col-span-2">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">Plano Premium</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Tudo que você precisa para gerar e exportar em escala, com consistência visual.
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit">Mais popular</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                    <li>Busca em massa.</li>
                    <li>Geração de banners em lote (ZIP).</li>
                    <li>Ranking Top 10.</li>
                  </ul>
                  <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                    <li>Mais opções de personalização por marca.</li>
                    <li>Envio pelo Telegram (quando disponível).</li>
                    <li>Fluxo mais rápido para publicar.</li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Comece criando sua conta gratuita e faça upgrade quando quiser.
                  </div>
                  <Button type="button" onClick={openAuth} className="gap-2 sm:w-auto">
                    Criar conta e ver Premium
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="faq" aria-label="Perguntas frequentes" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Perguntas frequentes</h2>
              <p className="text-sm text-muted-foreground">Respostas objetivas para você começar com confiança.</p>
            </div>

            <Card className="glass-effect">
              <CardContent className="p-4 sm:p-6">
                <Accordion type="single" collapsible>
                  <AccordionItem value="login">
                    <AccordionTrigger>Preciso ter conta para usar?</AccordionTrigger>
                    <AccordionContent>
                      Sim. Para realizar atividades é necessário criar uma conta e fazer login (mesmo na conta gratuita).
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="premium">
                    <AccordionTrigger>O que muda no Premium?</AccordionTrigger>
                    <AccordionContent>
                      O Premium libera recursos como busca em massa, geração de banners em lote e modelos de ranking Top 10.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="telegram">
                    <AccordionTrigger>Posso exportar por download e também enviar?</AccordionTrigger>
                    <AccordionContent>
                      Sim. Você pode escolher exportar por download ou enviar pelo Telegram quando essa opção estiver disponível.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="personalizacao">
                    <AccordionTrigger>Como personalizo com minha marca?</AccordionTrigger>
                    <AccordionContent>
                      Na Minha Área você configura cores, logo e dados de contato para aplicar nas artes.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Dúvida sobre conta, Premium ou configurações? Após entrar, você encontra tudo em “Minha Área”.
              </div>
              <Button type="button" onClick={openAuth} className="gap-2 sm:w-auto">
                Entrar / criar conta
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        </section>
      </main>

      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} MediaHub
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="link" className="h-auto p-0" onClick={() => setShowTermsModal(true)}>
                Termos de uso e privacidade
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {showTermsModal && (
        <TermsModal onClose={() => setShowTermsModal(false)} />
      )}
    </div>
  );
};

export default Index;
