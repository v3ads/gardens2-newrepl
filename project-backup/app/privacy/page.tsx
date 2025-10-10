export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <p className="text-lg mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
            <p className="mb-4">
              When you sign in with Google, we collect only the following information:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Your email address</li>
              <li>Your full name</li>
              <li>Your profile picture (if available)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
            <p className="mb-4">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Authenticate and identify you within the application</li>
              <li>Provide role-based access to features</li>
              <li>Display your name and profile information in the interface</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Data Storage and Security</h2>
            <p className="mb-4">
              Your information is stored securely in our database. We do not share your personal information with third parties except as required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
            <p className="mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Access your personal information</li>
              <li>Request deletion of your account and data</li>
              <li>Sign out at any time</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
            <p className="mb-4">
              If you have any questions about this Privacy Policy, please contact us at the email addresses provided in the application.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}