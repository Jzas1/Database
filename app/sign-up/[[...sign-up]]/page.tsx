import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAF7' }}>
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-2xl",
          },
          variables: {
            colorPrimary: '#0B2A3C',
            colorTextOnPrimaryBackground: '#F7F5F0',
          }
        }}
      />
    </div>
  )
}
