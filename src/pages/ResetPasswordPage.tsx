import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import { apiRequest } from "@/services/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") || "").trim(), [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Link inválido. Solicite uma nova recuperação.");
      return;
    }
    if (!password || !confirmPassword) {
      setError("Preencha a nova senha e a confirmação.");
      return;
    }
    if (password.length < 8) {
      setError("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    try {
      setIsLoading(true);
      await apiRequest<{ ok: boolean }>({
        path: "/api/auth/password-reset/confirm",
        method: "POST",
        body: { token, password },
      });
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Não foi possível redefinir a senha. Solicite um novo link.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">Defina uma nova senha para acessar sua conta.</p>
        </div>

        {!token && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Link inválido</AlertTitle>
            <AlertDescription>O token não foi encontrado na URL. Solicite uma nova recuperação.</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Senha atualizada</AlertTitle>
            <AlertDescription>
              Sua senha foi redefinida. Faça login normalmente.
              {" "}
              <Link to="/" className="underline underline-offset-2">
                Ir para login
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}

        {!success && (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || !token}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading || !token}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || !token}>
              {isLoading ? "Redefinindo..." : "Salvar nova senha"}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">Voltar ao login</Link>
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
