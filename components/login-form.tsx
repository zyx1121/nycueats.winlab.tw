"use client";

import { signInWithEmail, signInWithGoogle } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await signInWithEmail(
        formData.get("email") as string,
        formData.get("password") as string,
      );
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-bold">登入 NYCU Eats 系統</h1>
        </div>

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">密碼</FieldLabel>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "登入中…" : "登入"}
          </Button>
        </form>

        <FieldSeparator>或</FieldSeparator>

        <Field>
          <form action={signInWithGoogle}>
            <Button variant="outline" type="submit" className="w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              使用 Google 登入
            </Button>
          </form>
        </Field>
      </FieldGroup>
      <FieldDescription className="px-6 text-center">
        <a href="#">服務條款</a>{"．"}<a href="#">隱私政策</a>
      </FieldDescription>
    </div>
  );
}
