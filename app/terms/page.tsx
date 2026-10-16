import LegalPage from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Terms of Service — ${BRAND.name}` };

// Template terms — have a lawyer review before launch.
export default function Terms() {
  const n = BRAND.name;
  return (
    <LegalPage title="Terms of Service" updated="16 October 2026" sections={[
      ["1. The service", [`${n} ("we", "us") provides an online workspace for agencies to manage clients, content, tasks, team, finance and related data (the "Service"). By creating an account you ("Customer") agree to these Terms on behalf of your agency.`]],
      ["2. Accounts and team members", [
        "The person who creates a workspace is its owner and administrator. Administrators can invite team members and client-portal users, set their permissions and remove them.",
        "You are responsible for everything done under your workspace and for keeping login credentials secure.",
      ]],
      ["3. Plans, billing and limits", [
        "Paid plans are billed monthly in advance through Razorpay. Prices are in Indian Rupees and exclude applicable taxes.",
        "Each plan has limits on active team members and tasks created per calendar month, and some modules are only available on higher plans. When a limit is reached, new items cannot be added until you upgrade or the next month begins.",
        "New workspaces get a free trial. If no plan is active when the trial or a paid period ends (plus a short grace period for failed renewals), the workspace is paused until a plan is purchased. Your data is retained while paused.",
        "You can cancel at any time; access continues until the end of the paid period. Payments are non-refundable except where required by law.",
      ]],
      ["4. Your data and our access to it", [
        "You own the data you put into the Service. You give us the permission needed to host, process, back up and display it to provide the Service.",
        `${n} staff with administrative access to the platform can view workspace data, including account details, team members, clients, tasks, content, finance and HR records. We access it only to operate the Service: providing support you request, billing and plan enforcement, investigating security incidents, abuse or Terms violations, maintaining and improving reliability, and meeting legal obligations. Access is limited to authorised personnel.`,
        "We do not sell your workspace data and do not share it with other customers.",
      ]],
      ["5. Acceptable use", ["Do not use the Service for unlawful content, to infringe others' rights, to send spam, to attempt to access other workspaces, or to disrupt the Service. We may suspend workspaces that do."]],
      ["6. Termination", ["You may stop using the Service at any time. We may suspend or terminate a workspace for non-payment or breach of these Terms. After termination we may delete workspace data after a reasonable period; ask us before then if you need an export."]],
      ["7. Disclaimers and liability", ["The Service is provided \"as is\". To the extent permitted by law, our total liability for any claim is limited to the fees you paid in the three months before the claim."]],
      ["8. Changes", ["We may update these Terms. Material changes will be notified in the app or by email before they take effect."]],
      ["9. Governing law", ["These Terms are governed by the laws of India."]],
    ]} />
  );
}
