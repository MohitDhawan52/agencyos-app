import LegalPage from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Privacy Policy — ${BRAND.name}` };

// Template policy — have a lawyer review before launch.
export default function Privacy() {
  const n = BRAND.name;
  return (
    <LegalPage title="Privacy Policy" updated="16 October 2026" sections={[
      ["What we collect", [
        "Account data: names, email addresses, phone numbers and passwords (stored hashed) of workspace admins, team members and client-portal users.",
        "Workspace data: everything your agency enters — clients, content, tasks, leads, attendance, finance, invoices, HR records and uploaded files.",
        "Billing data: plan, subscription and payment status from Razorpay. We never see or store full card details.",
        "Technical data: logs needed to keep the Service secure and working.",
      ]],
      ["How we use it", ["To provide and secure the Service, process payments, enforce plan limits, provide support, and communicate about your account."]],
      ["Who can see your data", [
        "Inside your workspace: your admins and team members according to the permissions your admins set; client-portal users see only their own brand's content calendar.",
        `${n} platform administrators can access all workspace data for the purposes listed in our Terms of Service (support, billing, security, reliability and legal compliance). This access is restricted to authorised personnel.`,
        "Service providers that host or process data for us (database and file hosting, Razorpay for payments) under their own security and confidentiality obligations.",
        "Authorities, where required by law.",
      ]],
      ["Retention and deletion", ["We keep workspace data while your account exists. After a workspace is terminated we may delete it after a reasonable period. Admins can ask us to delete the workspace earlier."]],
      ["Security", ["Each workspace's data is isolated at the database level, connections are encrypted, and access to the platform's administrative tools is restricted."]],
      ["Your rights", [`You can access, correct or delete personal data through the app or by writing to ${BRAND.supportEmail}.`]],
    ]} />
  );
}
