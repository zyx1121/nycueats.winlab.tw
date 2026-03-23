import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="h-[calc(100dvh-4rem)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main >
  );
}
