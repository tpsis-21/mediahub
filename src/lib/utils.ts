import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type SearchConfigToastCopy = {
  title: string
  description: string
  actionLabel: string
}

export function isSearchConfigErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()

  return (
    normalized.includes("integração de busca") ||
    normalized.includes("busca indisponível") ||
    normalized.includes("sem permissão")
  )
}

export function getSearchConfigToastCopy(args: {
  rawMessage: string
  isLoggedIn: boolean
  isAdmin: boolean
}): SearchConfigToastCopy {
  if (!args.isLoggedIn) {
    return {
      title: "Ação necessária",
      description: "Faça login para continuar.",
      actionLabel: "Fazer login",
    }
  }

  if (args.isAdmin) {
    return {
      title: "Configuração necessária",
      description: args.rawMessage,
      actionLabel: "Abrir Admin",
    }
  }

  return {
    title: "Ação necessária",
    description: "Atualize suas configurações para continuar.",
    actionLabel: "Abrir Área",
  }
}

export function formatWebsiteForDisplay(value: string): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return ""
  const withoutProtocol = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "")
  return withoutProtocol.replace(/\/+$/, "")
}

export function formatPhoneForDisplay(value: string): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return ""

  let digits = raw.replace(/\D/g, "")
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2)

  if (digits.length === 11) {
    const ddd = digits.slice(0, 2)
    const first = digits.slice(2, 7)
    const last = digits.slice(7)
    return `(${ddd}) ${first}-${last}`
  }

  if (digits.length === 10) {
    const ddd = digits.slice(0, 2)
    const first = digits.slice(2, 6)
    const last = digits.slice(6)
    return `(${ddd}) ${first}-${last}`
  }

  return raw
}
