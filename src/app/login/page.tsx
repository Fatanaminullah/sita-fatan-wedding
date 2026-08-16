import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from './login-form'
import { Monogram } from '@/components/monogram'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {/* mx-auto, not the header's items-center: CardHeader is a grid, so
              its items stretch rather than centre. */}
          <Monogram size={56} className="mx-auto mb-2" alt="Sita and Fatan monogram" />
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Sita &amp; Fatan wedding guest management</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  )
}
