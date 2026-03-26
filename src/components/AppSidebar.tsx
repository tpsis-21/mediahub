import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  LayoutDashboard,
  History,
  LifeBuoy,
  Trophy,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ticketService } from "@/services/ticketService";
import { Button } from "@/components/ui/button";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { user, getDaysUntilExpiry, isNearExpiry, isPremiumActive, isPremiumExpired } = useAuth();
  const [ticketsEnabled, setTicketsEnabled] = useState(false);

  const appGradient = "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))";

  const openUserArea = () => window.dispatchEvent(new Event("mediahub:openUserAreaModal"));
  const isPremiumUser = isPremiumActive();

  const planName = useMemo(() => {
    if (!user) return "";
    if (user.type === "admin") return "Admin";
    if (user.type === "premium") return "Premium";
    return "Free";
  }, [user]);

  const planStatus = useMemo(() => {
    if (!user) return "";
    if (user.type === "admin") return "Ativo";
    if (user.type === "premium") {
      if (isPremiumExpired()) return "Expirado";
      if (isNearExpiry()) return "Expira em breve";
      return "Ativo";
    }
    return "Ativo";
  }, [user, isNearExpiry, isPremiumExpired]);

  const subscriptionDateLabel = useMemo(() => {
    const end = user?.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
    if (!end || Number.isNaN(end.getTime())) return null;
    return end.toLocaleDateString("pt-BR");
  }, [user?.subscriptionEnd]);

  const planTone = useMemo(() => {
    if (!user) return "neutral";
    if (user.type === "premium" && (isNearExpiry() || isPremiumExpired())) return "danger";
    return "neutral";
  }, [user, isNearExpiry, isPremiumExpired]);
  
  useEffect(() => {
    let active = true;
    ticketService.getSettings()
      .then(({ enabled }) => {
        if (active) setTicketsEnabled(Boolean(enabled));
      })
      .catch(() => {});
    const onChanged = (e: Event) => {
      const val = (e as CustomEvent<{ enabled: boolean }>).detail?.enabled;
      if (typeof val === "boolean") setTicketsEnabled(val);
    };
    window.addEventListener("mediahub:ticketsSettingsChanged", onChanged as EventListener);
    return () => {
      active = false;
      window.removeEventListener("mediahub:ticketsSettingsChanged", onChanged as EventListener);
    };
  }, []);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/app">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-transparent text-sidebar-primary-foreground">
                  <Avatar className="h-12 w-12 rounded-lg">
                    <AvatarImage
                      src={theme === 'dark' ? "/anexos/logo-of-mediahub-dark.png" : "/anexos/logo-of-mediahub.png"}
                      alt={`${t("app.title")} - Logo da aplicação`}
                      className="object-contain drop-shadow-sm"
                    />
                    <AvatarFallback style={{ background: appGradient }}>
                      <Search className="h-4 w-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span
                    className="truncate font-semibold bg-clip-text text-transparent"
                    style={{ backgroundImage: appGradient }}
                  >
                    {t("app.title")}
                  </span>
                  <span className="truncate text-xs">Dashboard</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Gerar Media VOD">
                  <Link to="/app">
                    <LayoutDashboard />
                    <span>Gerar Media VOD</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => {
                    if (!isPremiumUser) {
                      openUserArea();
                      return;
                    }
                    window.dispatchEvent(new Event("mediahub:openFootballBannerModal"));
                  }}
                  tooltip="Gerar Banner Futebol"
                >
                  <CalendarDays />
                  <span>Gerar Banner Futebol</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => {
                    if (!isPremiumUser) {
                      openUserArea();
                      return;
                    }
                    window.dispatchEvent(new Event("mediahub:openTop10BannerModal"));
                  }}
                  tooltip="Gerar Banner Top 10"
                >
                  <Trophy />
                  <span>Gerar Banner Top 10</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Histórico">
                  <a href="#history">
                    <History />
                    <span>Histórico</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {(user?.type === 'admin' || ticketsEnabled) && (
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    onClick={() => window.dispatchEvent(new Event("mediahub:openSupportModal"))}
                    tooltip="Suporte & Tickets"
                  >
                    <LifeBuoy />
                    <span>Suporte & Tickets</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {user?.type === "admin" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Painel Admin">
                    <Link to="/admin">
                      <ShieldCheck />
                      <span>Painel Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {user && (
          <div
            className={`m-2 rounded-xl border p-4 ${
              planTone === "danger"
                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                : "bg-sidebar-accent/50 border-sidebar-border"
            } group-data-[collapsible=icon]:hidden`}
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Seu plano</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-semibold leading-tight">{planName}</p>
                  <Badge
                    variant={planTone === "danger" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {planStatus}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {user.type === "premium" && subscriptionDateLabel ? (
                    <>
                      {isPremiumExpired() ? "Venceu em: " : "Vence em: "}
                      <span className="font-medium text-foreground">{subscriptionDateLabel}</span>
                    </>
                  ) : (
                    <>
                      Vencimento: <span className="font-medium text-foreground">—</span>
                    </>
                  )}
                </p>
                {user.type === "premium" && subscriptionDateLabel && Number.isFinite(getDaysUntilExpiry()) && (
                  <p className={`text-[10px] font-medium ${planTone === "danger" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {isPremiumExpired()
                      ? "Renove para desbloquear os recursos."
                      : isNearExpiry()
                        ? `Faltam ${getDaysUntilExpiry()} dia${getDaysUntilExpiry() === 1 ? "" : "s"} para vencer.`
                        : "Assinatura em dia."}
                  </p>
                )}
              </div>

              {user.type === "free" && (
                <Button
                  type="button"
                  className="w-full justify-center"
                  onClick={openUserArea}
                >
                  Mudar de Plano
                </Button>
              )}
            </div>
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
