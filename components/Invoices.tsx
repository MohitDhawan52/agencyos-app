"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { FINANCE_ACCOUNTS } from "@/lib/org";

// ── Fallback: used only if company_settings table is empty ───────────────────
const DEFAULT_COMPANY = {
  company_name: "",
  company_address: "",
  company_gstin: "",
  logo_url: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_name: "",
  bank_ifsc: "",
  bank_branch: "",
  bank_upi: "",
  invoice_prefix: "INV",
  invoice_start_number: 1,
  invoice_terms: [
    "Payment Made for this invoice should be through Bank Transfer Only.",
    "Payment Should be cleared within Due Date.",
    "This is a Monthly Plan Invoice",
  ],
};

const ACCOUNTS = FINANCE_ACCOUNTS;

// ── Helpers ──────────────────────────────────────────────────────────────────
const getFY = () => {
  const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear();
  return m >= 4 ? `${String(y).slice(-2)}-${String(y + 1).slice(-2)}` : `${String(y - 1).slice(-2)}-${String(y).slice(-2)}`;
};

const numToWords = (num: number): string => {
  if (num === 0) return "Indian Rupee Zero Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convert = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " And " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };
  const intPart = Math.floor(num);
  const dec = Math.round((num - intPart) * 100);
  return "Indian Rupee " + convert(intPart) + (dec ? " And " + convert(dec) + " Paise" : "") + " Only";
};

const fmt = (n: number) => Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const todayStr = () => new Date().toISOString().split("T")[0];

const emptyItem = () => ({ _id: crypto.randomUUID(), description: "", sac: "998361", qty: "1", rate: "" });
const defaultForm = () => ({
  customer_id: "", customer_name: "", customer_address: "", customer_gstin: "",
  customer_place_of_supply: "",
  invoice_date: todayStr(), due_date: todayStr(),
  terms: "Due on Receipt", apply_gst: true, gst_rate: "9", notes: "",
  order_number: "", salesperson: "", subject: "",
  discount: "0", adjustment: "0",
  customer_notes: "Thanks for your business.",
  invoice_no_override: "",
});

// ── Print: Zoho Books–style Tax Invoice ──────────────────────────────────────
const handlePrint = (inv: any, co: any = DEFAULT_COMPANY) => {
  const logoUrl = co.logo_url || "";
  // Missing signature → image 404 → onerror prints without it.
  const sigUrl = co.signature_url || (window.location.origin + "/__no-signature.png");
  const items: any[] = inv.items || [];
  const applyGst = inv.apply_gst !== false;
  const gstRate = inv.cgst_rate || 9;
  const discountPct = inv.discount_percent || 0;
  const discountAmt = (inv.subtotal || 0) * discountPct / 100;
  const adjustmentAmt = inv.adjustment || 0;
  const roundOff = inv.round_off || 0;
  const dueAmt = inv.status === "paid" ? 0 : (inv.total || 0);

  const itemRows = items.map((item: any, i: number) => {
    const qty = parseFloat(item.qty) || 0;
    const rate = parseFloat(item.rate) || 0;
    const lineTotal = qty * rate;
    const gstAmt = lineTotal * gstRate / 100;
    return `
    <tr style="${i % 2 === 1 ? "background:#fafafa;" : ""}">
      <td style="text-align:center;padding:9px 6px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;color:#6b7280;font-size:11.5px;">${i + 1}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;vertical-align:top;">
        <div style="font-weight:600;color:#111;font-size:11.5px;">${item.description}</div>
        ${item.sac ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">SAC: ${item.sac}</div>` : ""}
      </td>
      <td style="text-align:center;padding:9px 8px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:11.5px;">${qty.toFixed(2)}</td>
      <td style="text-align:right;padding:9px 12px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:11.5px;font-variant-numeric:tabular-nums;">${fmt(rate)}</td>
      ${applyGst ? `
        <td style="text-align:center;padding:9px 6px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:11px;">${gstRate}%</td>
        <td style="text-align:right;padding:9px 8px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:11px;font-variant-numeric:tabular-nums;">${fmt(gstAmt)}</td>
        <td style="text-align:center;padding:9px 6px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:11px;">${gstRate}%</td>
        <td style="text-align:right;padding:9px 8px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:11px;font-variant-numeric:tabular-nums;">${fmt(gstAmt)}</td>
      ` : ""}
      <td style="text-align:right;padding:9px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:11.5px;font-variant-numeric:tabular-nums;">${fmt(lineTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Tax Invoice ${inv.invoice_no}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { margin: 0; size: A4 portrait; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { max-width: 794px; margin: 0 auto; }
  @media print {
    body { margin: 0; }
    .page { max-width: 100%; }
    .top-bar, .th-bg, .grand-row { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Orange top bar -->
  <div class="top-bar" style="height:5px;background:#E67E22;"></div>
  <div style="padding:24px 32px 36px;">

    <!-- Header: Logo+Company | TAX INVOICE -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <img src="${logoUrl}" alt="Logo" style="width:58px;height:58px;object-fit:contain;" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:3px;">${co.company_name || DEFAULT_COMPANY.company_name}</div>
          <div style="font-size:10.5px;color:#555;line-height:1.7;">${(co.company_address || DEFAULT_COMPANY.company_address).replace(/\n/g, "<br/>")}</div>
          <div style="font-size:10.5px;color:#555;">GSTIN: ${co.company_gstin || DEFAULT_COMPANY.company_gstin}</div>
          ${co.company_phone ? `<div style="font-size:10.5px;color:#555;">Ph: ${co.company_phone}</div>` : ""}
          ${co.company_email ? `<div style="font-size:10.5px;color:#555;">${co.company_email}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:26px;font-weight:700;color:#0077B6;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">TAX INVOICE</div>
        <div style="display:inline-block;font-size:9px;color:#E67E22;border:1.5px solid #E67E22;padding:2px 10px;text-transform:uppercase;font-weight:700;letter-spacing:.6px;">ORIGINAL FOR RECIPIENT</div>
      </div>
    </div>

    <div style="border-top:2px solid #111;margin-bottom:16px;"></div>

    <!-- Bill To + Invoice Meta -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;">
      <div>
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px;">Bill To</div>
        <div style="font-size:14px;font-weight:700;color:#111;margin-bottom:3px;">${inv.customer_name}</div>
        ${inv.customer_address ? `<div style="font-size:11px;color:#555;line-height:1.6;white-space:pre-wrap;">${inv.customer_address}</div>` : ""}
        ${inv.customer_gstin ? `<div style="font-size:11px;color:#555;margin-top:4px;"><strong>GSTIN:</strong> ${inv.customer_gstin}</div>` : ""}
      </div>
      <div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr>
            <td style="color:#555;padding:3.5px 0;width:130px;">Invoice No</td>
            <td style="color:#555;padding:3.5px 0;width:10px;">:</td>
            <td style="font-weight:700;padding:3.5px 0;color:#0077B6;">${inv.invoice_no}</td>
          </tr>
          <tr>
            <td style="color:#555;padding:3.5px 0;">Invoice Date</td>
            <td style="color:#555;padding:3.5px 0;">:</td>
            <td style="font-weight:600;padding:3.5px 0;">${new Date(inv.invoice_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
          </tr>
          ${inv.due_date ? `<tr>
            <td style="color:#555;padding:3.5px 0;">Due Date</td>
            <td style="color:#555;padding:3.5px 0;">:</td>
            <td style="font-weight:600;padding:3.5px 0;">${new Date(inv.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
          </tr>` : ""}
          <tr>
            <td style="color:#555;padding:3.5px 0;">Terms</td>
            <td style="color:#555;padding:3.5px 0;">:</td>
            <td style="font-weight:600;padding:3.5px 0;">${inv.terms || "Due on Receipt"}</td>
          </tr>
          <tr>
            <td style="color:#555;padding:3.5px 0;">Place of Supply</td>
            <td style="color:#555;padding:3.5px 0;">:</td>
            <td style="font-weight:600;padding:3.5px 0;">${inv.customer_place_of_supply || ""}</td>
          </tr>
          ${inv.order_number ? `<tr>
            <td style="color:#555;padding:3.5px 0;">Order No.</td>
            <td style="color:#555;padding:3.5px 0;">:</td>
            <td style="font-weight:600;padding:3.5px 0;">${inv.order_number}</td>
          </tr>` : ""}
          ${inv.subject ? `<tr>
            <td style="color:#555;padding:3.5px 0;">Subject</td>
            <td style="color:#555;padding:3.5px 0;">:</td>
            <td style="font-weight:600;padding:3.5px 0;">${inv.subject}</td>
          </tr>` : ""}
        </table>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid #d1d5db;margin-bottom:0;">
      <thead>
        <tr class="th-bg" style="background:#f1f5f9;">
          <th style="border:1px solid #d1d5db;padding:9px 6px;text-align:center;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;width:30px;">#</th>
          <th style="border:1px solid #d1d5db;padding:9px 12px;text-align:left;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;">Item &amp; Description</th>
          <th style="border:1px solid #d1d5db;padding:9px 8px;text-align:center;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;width:48px;">Qty</th>
          <th style="border:1px solid #d1d5db;padding:9px 12px;text-align:right;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;width:88px;">Rate</th>
          ${applyGst ? `
            <th colspan="2" style="border:1px solid #d1d5db;padding:9px 6px;text-align:center;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;">CGST</th>
            <th colspan="2" style="border:1px solid #d1d5db;padding:9px 6px;text-align:center;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;">SGST</th>
          ` : ""}
          <th style="border:1px solid #d1d5db;padding:9px 12px;text-align:right;font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;width:88px;">Amount</th>
        </tr>
        ${applyGst ? `<tr style="background:#f8fafc;">
          <th style="border:1px solid #d1d5db;padding:4px;background:#f8fafc;"></th>
          <th style="border:1px solid #d1d5db;padding:4px;background:#f8fafc;"></th>
          <th style="border:1px solid #d1d5db;padding:4px;background:#f8fafc;"></th>
          <th style="border:1px solid #d1d5db;padding:4px;background:#f8fafc;"></th>
          <th style="border:1px solid #d1d5db;padding:4px;text-align:center;font-size:10px;font-weight:600;color:#6b7280;background:#f8fafc;">%</th>
          <th style="border:1px solid #d1d5db;padding:4px 6px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;background:#f8fafc;">Amt</th>
          <th style="border:1px solid #d1d5db;padding:4px;text-align:center;font-size:10px;font-weight:600;color:#6b7280;background:#f8fafc;">%</th>
          <th style="border:1px solid #d1d5db;padding:4px 6px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;background:#f8fafc;">Amt</th>
          <th style="border:1px solid #d1d5db;padding:4px;background:#f8fafc;"></th>
        </tr>` : ""}
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- Bottom: Notes+Bank+T&C (left) | Amount Words+Totals+Signature (right) -->
    <div style="display:grid;grid-template-columns:1fr 260px;gap:24px;margin-top:18px;align-items:start;">
      <!-- Left column -->
      <div>
        ${inv.customer_notes ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:10.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Customer Notes</div>
          <div style="font-size:11.5px;color:#555;line-height:1.7;">${inv.customer_notes}</div>
        </div>` : ""}
        <div style="margin-bottom:13px;">
          <div style="font-size:11px;font-weight:700;text-decoration:underline;color:#111;margin-bottom:6px;">Bank Details</div>
          <div style="font-size:11px;color:#374151;line-height:1.9;">
            <strong>Account Name:</strong> ${co.bank_account_name || DEFAULT_COMPANY.bank_account_name}<br/>
            <strong>Account No:</strong> ${co.bank_account_number || DEFAULT_COMPANY.bank_account_number}<br/>
            <strong>Bank:</strong> ${co.bank_name || DEFAULT_COMPANY.bank_name}<br/>
            <strong>IFSC:</strong> ${co.bank_ifsc || DEFAULT_COMPANY.bank_ifsc}<br/>
            <strong>Branch:</strong> ${co.bank_branch || DEFAULT_COMPANY.bank_branch}
            ${co.bank_upi ? `<br/><strong>UPI:</strong> ${co.bank_upi}` : ""}
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:5px;">Terms &amp; Conditions</div>
          ${(co.invoice_terms || DEFAULT_COMPANY.invoice_terms).map((t: string, i: number) => `<div style="font-size:10.5px;color:#555;line-height:1.7;">${i + 1}. ${t}</div>`).join("")}
        </div>
      </div>

      <!-- Right column -->
      <div>
        <div style="font-size:11.5px;font-style:italic;color:#374151;margin-bottom:14px;line-height:1.5;">
          <strong style="font-style:normal;">${numToWords(inv.total || 0)}</strong>
        </div>
        <!-- Totals box -->
        <div style="border:1px solid #d1d5db;border-radius:4px;overflow:hidden;margin-bottom:22px;">
          <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            <span style="color:#374151;">Sub Total</span>
            <span style="font-weight:600;font-variant-numeric:tabular-nums;">₹${fmt(inv.subtotal || 0)}</span>
          </div>
          ${discountPct > 0 ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            <span style="color:#374151;">Discount (${discountPct}%)</span>
            <span style="font-weight:600;color:#e17055;font-variant-numeric:tabular-nums;">−₹${fmt(discountAmt)}</span>
          </div>` : ""}
          ${applyGst ? `
          <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            <span style="color:#374151;">CGST (${gstRate}%)</span>
            <span style="font-weight:600;font-variant-numeric:tabular-nums;">₹${fmt(inv.cgst_amount || 0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            <span style="color:#374151;">SGST (${gstRate}%)</span>
            <span style="font-weight:600;font-variant-numeric:tabular-nums;">₹${fmt(inv.sgst_amount || 0)}</span>
          </div>` : ""}
          ${adjustmentAmt !== 0 ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            <span style="color:#374151;">Adjustment</span>
            <span style="font-weight:600;font-variant-numeric:tabular-nums;">${adjustmentAmt < 0 ? "−₹" + fmt(Math.abs(adjustmentAmt)) : "₹" + fmt(adjustmentAmt)}</span>
          </div>` : ""}
          ${Math.abs(roundOff) > 0.001 ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">
            <span style="color:#374151;">Round Off</span>
            <span style="font-weight:600;font-variant-numeric:tabular-nums;">${roundOff < 0 ? "−₹" + fmt(Math.abs(roundOff)) : "+₹" + fmt(roundOff)}</span>
          </div>` : ""}
          <div class="grand-row" style="display:flex;justify-content:space-between;padding:10px 12px;font-size:13px;font-weight:700;background:#f1f5f9;border-top:2px solid #d1d5db;">
            <span>Total</span>
            <span style="font-variant-numeric:tabular-nums;">₹${fmt(inv.total || 0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 12px;font-size:12px;font-weight:700;color:${dueAmt === 0 ? "#16a34a" : "#dc2626"};">
            <span>Balance Due</span>
            <span style="font-variant-numeric:tabular-nums;">₹${fmt(dueAmt)}</span>
          </div>
        </div>
        <!-- Signature -->
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:8px;">For ${co.company_name || DEFAULT_COMPANY.company_name}</div>
          <canvas id="sig-canvas" style="display:block;margin-left:auto;"></canvas>
          <div style="border-top:1px solid #9ca3af;padding-top:5px;font-size:10.5px;color:#555;margin-top:6px;">Authorized Signature</div>
        </div>
      </div>
    </div>

  </div><!-- /inner -->
</div><!-- /page -->
<script>
window.onload = function() {
  var img = new Image();
  img.onload = function() {
    var canvas = document.getElementById('sig-canvas');
    var scale = 70 / img.naturalWidth;
    canvas.width = Math.round(img.naturalHeight * scale);
    canvas.height = 70;
    var ctx = canvas.getContext('2d');
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    window.print();
  };
  img.onerror = function() { window.print(); };
  img.src = '${sigUrl}';
};
</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Allow pop-ups to print invoice."); return; }
  w.document.write(html);
  w.document.close();
};

// ── Component ────────────────────────────────────────────────────────────────
export default function Invoices({ balances, onPaymentRecorded }: {
  balances: Record<string, number>;
  onPaymentRecorded: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"list" | "customers">("list");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [markPaidModal, setMarkPaidModal] = useState<any>(null);
  const [paidForm, setPaidForm] = useState({ date: todayStr(), account: "Current Account" });
  const [paidSaving, setPaidSaving] = useState(false);

  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [custForm, setCustForm] = useState<any>({});
  const [custSaving, setCustSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [invForm, setInvForm] = useState<any>(defaultForm());
  const [invItems, setInvItems] = useState<any[]>([emptyItem()]);

  const [searchInv, setSearchInv] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => { fetchAll(); fetchCompanySettings(); }, []);

  const fetchCompanySettings = async () => {
    const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    if (data) setCompanySettings(data);
  };

  const getCoInfo = () => companySettings || DEFAULT_COMPANY;

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: inv }, { data: cl }] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("*").eq("status", "Active").order("name"),
    ]);
    if (inv) setInvoices(inv);
    if (cl) setCustomers(cl);
    setLoading(false);
  };

  const getNextInvoiceNo = async () => {
    const fy = getFY();
    const co = getCoInfo();
    const pfx = co.invoice_prefix || co.bank?.name?.split(" ")[0] || "INV";
    const prefix = `${pfx}/${fy}`;
    const startNum = co.invoice_start_number || 1;
    const { data } = await supabase.from("invoices").select("invoice_no").like("invoice_no", `${prefix}%`).order("invoice_no", { ascending: false }).limit(1);
    if (data?.length) {
      const last = parseInt(data[0].invoice_no.replace(prefix, "")) || 0;
      const next = Math.max(last + 1, startNum);
      return `${prefix}${String(next).padStart(3, "0")}`;
    }
    return `${prefix}${String(startNum).padStart(3, "0")}`;
  };

  const openCreate = async () => {
    setEditId(null);
    setInvForm(defaultForm());
    setInvItems([emptyItem()]);
    setShowForm(true);
    const nextNo = await getNextInvoiceNo();
    setInvForm((f: any) => ({ ...f, invoice_no_override: nextNo }));
  };

  const openEdit = (inv: any) => {
    if (inv.status === "paid") return;
    setEditId(inv.id);
    setInvForm({
      customer_id: inv.customer_id || "",
      customer_name: inv.customer_name,
      customer_address: inv.customer_address || "",
      customer_gstin: inv.customer_gstin || "",
      customer_place_of_supply: inv.customer_place_of_supply || "",
      invoice_date: inv.invoice_date,
      due_date: inv.due_date || inv.invoice_date,
      terms: inv.terms || "Due on Receipt",
      apply_gst: inv.apply_gst !== false,
      gst_rate: String(inv.cgst_rate || 9),
      notes: inv.notes || "",
      order_number: inv.order_number || "",
      salesperson: inv.salesperson || "",
      subject: inv.subject || "",
      discount: String(inv.discount_percent || 0),
      adjustment: String(inv.adjustment || 0),
      customer_notes: inv.customer_notes || "Thanks for your business.",
      invoice_no_override: inv.invoice_no || "",
    });
    setInvItems((inv.items || []).map((item: any) => ({
      _id: crypto.randomUUID(),
      description: item.description,
      sac: item.sac || "998361",
      qty: String(item.qty),
      rate: String(item.rate),
    })));
    setShowForm(true);
  };

  const selectCustomer = (customerId: string) => {
    const c = customers.find(c => c.id === customerId);
    if (!c) { setInvForm((f: any) => ({ ...f, customer_id: "" })); return; }
    setInvForm((f: any) => ({
      ...f,
      customer_id: c.id,
      customer_name: c.name,
      customer_address: c.billing_address || c.address || "",
      customer_gstin: c.gstin || "",
      customer_place_of_supply: c.place_of_supply || "",
    }));
  };

  const calcTotals = () => {
    const subtotal = invItems.reduce((s, item) => s + (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0), 0);
    const gstRate = parseFloat(invForm.gst_rate) || 9;
    const discountPct = parseFloat(invForm.discount) || 0;
    const discountAmt = subtotal * discountPct / 100;
    const afterDiscount = subtotal - discountAmt;
    const cgstAmt = invForm.apply_gst ? afterDiscount * gstRate / 100 : 0;
    const sgstAmt = invForm.apply_gst ? afterDiscount * gstRate / 100 : 0;
    const adjustmentAmt = parseFloat(invForm.adjustment) || 0;
    const beforeRound = afterDiscount + cgstAmt + sgstAmt + adjustmentAmt;
    const roundOff = Math.round(beforeRound) - beforeRound;
    const total = beforeRound + roundOff;
    return { subtotal, discountAmt, afterDiscount, cgstAmt, sgstAmt, adjustmentAmt, roundOff, total, gstRate };
  };

  const saveInvoice = async (status: "draft" | "sent") => {
    if (!invForm.customer_name.trim()) return;
    setSaving(true);
    const { subtotal, discountAmt, cgstAmt, sgstAmt, adjustmentAmt, roundOff, total, gstRate } = calcTotals();
    const items = invItems
      .filter(item => item.description.trim())
      .map(item => ({
        description: item.description,
        sac: item.sac,
        qty: parseFloat(item.qty) || 0,
        rate: parseFloat(item.rate) || 0,
      }));
    // Strip UI-only fields before sending to DB
    const { gst_rate: _g, invoice_no_override: _n, discount: _d, adjustment: _a, customer_notes: _cn, ...formData } = invForm;
    const customer_notes = invForm.customer_notes || "";
    const payload = {
      ...formData,
      customer_notes,
      items, subtotal,
      discount_percent: parseFloat(invForm.discount) || 0,
      cgst_rate: gstRate, cgst_amount: cgstAmt,
      sgst_rate: gstRate, sgst_amount: sgstAmt,
      adjustment: parseFloat(invForm.adjustment) || 0,
      round_off: roundOff,
      total, status,
    };
    let err: any = null;
    if (editId) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", editId);
      err = error;
    } else {
      const invoice_no = invForm.invoice_no_override?.trim() || await getNextInvoiceNo();
      const { error } = await supabase.from("invoices").insert([{ ...payload, invoice_no }]);
      err = error;
    }
    setSaving(false);
    if (err) {
      alert("Save failed: " + (err.message || "Run the SQL migration in Supabase first — see the setup instructions."));
      return;
    }
    setShowForm(false);
    fetchAll();
  };

  const markAsPaid = async () => {
    if (!markPaidModal) return;
    setPaidSaving(true);

    const { error: e1 } = await supabase.from("invoices").update({
      status: "paid",
      payment_date: paidForm.date,
      payment_account: paidForm.account,
    }).eq("id", markPaidModal.id);

    if (e1) { alert("Failed: " + e1.message); setPaidSaving(false); return; }

    const { error: e2 } = await supabase.from("transactions").insert([{
      type: "income",
      amount: markPaidModal.total,
      description: `Invoice ${markPaidModal.invoice_no} — ${markPaidModal.customer_name}`,
      account: paidForm.account,
      date: paidForm.date,
      category: "Retainer",
      client: markPaidModal.customer_name,
    }]);

    if (e2) { alert("Invoice marked paid but transaction failed: " + e2.message); }

    const currentBal = balances[paidForm.account] || 0;
    await supabase.from("balances").upsert(
      [{ account: paidForm.account, amount: currentBal + markPaidModal.total }],
      { onConflict: "account" }
    );

    setPaidSaving(false);
    setMarkPaidModal(null);
    fetchAll();
    onPaymentRecorded();
  };

  const deleteInvoice = async (id: string) => {
    await supabase.from("invoices").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchAll();
  };

  const saveCustomerGSTIN = async () => {
    if (!editCustomer) return;
    setCustSaving(true);
    await supabase.from("clients").update({
      gstin: custForm.gstin || null,
      billing_address: custForm.billing_address || null,
      place_of_supply: custForm.place_of_supply || "",
    }).eq("id", editCustomer.id);
    setCustSaving(false);
    setEditCustomer(null);
    fetchAll();
  };

  const STATUS_STYLE: Record<string, any> = {
    draft:   { bg: "rgba(148,163,184,.12)", color: "#94a3b8", border: "rgba(148,163,184,.3)" },
    sent:    { bg: "rgba(96,165,250,.12)",  color: "#60a5fa", border: "rgba(96,165,250,.3)"  },
    paid:    { bg: "rgba(74,222,128,.12)",  color: "#4ade80", border: "rgba(74,222,128,.3)"  },
    overdue: { bg: "rgba(248,113,113,.12)", color: "#f87171", border: "rgba(248,113,113,.3)" },
  };

  const filteredInv = invoices
    .filter(i => filterStatus === "All" || i.status === filterStatus.toLowerCase())
    .filter(i => !searchInv || i.customer_name?.toLowerCase().includes(searchInv.toLowerCase()) || i.invoice_no?.includes(searchInv));

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((a, b) => a + b.total, 0);
  const totalPending = invoices.filter(i => i.status === "sent" || i.status === "overdue").reduce((a, b) => a + b.total, 0);

  const IS: React.CSSProperties = { width: "100%", background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" };

  // ── Create / Edit Form ────────────────────────────────────────────────────
  if (showForm) {
    const totals = calcTotals();
    const totalQty = invItems.reduce((s, item) => s + (parseFloat(item.qty) || 0), 0);
    const ZI: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#111827", outline: "none", background: "#fff", fontFamily: "inherit" };
    const ROW: React.CSSProperties = { display: "flex", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #f3f4f6" };
    const LB = (required?: boolean): React.CSSProperties => ({ width: 190, fontSize: 13, color: required ? "#dc2626" : "#374151", flexShrink: 0, paddingTop: 9, fontWeight: 500 });

    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f3f4f6", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, zIndex: 10000, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <i className="ti ti-file-invoice" style={{ fontSize: 20, color: "#6b7280" }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{editId ? "Edit Invoice" : "New Invoice"}</span>
            {invForm.invoice_no_override && (
              <span style={{ fontSize: 12, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 10px" }}>{invForm.invoice_no_override}</span>
            )}
          </div>
          <button onClick={() => setShowForm(false)} style={{ width: 34, height: 34, border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 16px 110px" }}>

          {/* ── Card 1: Customer + Invoice fields ── */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "4px 20px 0", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>

            {/* Customer Name */}
            <div style={ROW}>
              <span style={LB(true)}>Customer Name <span style={{ color: "#dc2626" }}>*</span></span>
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                <select value={invForm.customer_id} onChange={e => selectCustomer(e.target.value)} style={{ ...ZI, flex: 1, cursor: "pointer" }}>
                  <option value="">— Select from clients —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!invForm.customer_id && (
                  <input value={invForm.customer_name} onChange={e => setInvForm((f: any) => ({ ...f, customer_name: e.target.value }))} placeholder="Or type name" style={{ ...ZI, width: 200 }} />
                )}
              </div>
            </div>

            {/* GSTIN */}
            <div style={ROW}>
              <span style={LB()}>GSTIN</span>
              <input value={invForm.customer_gstin} onChange={e => setInvForm((f: any) => ({ ...f, customer_gstin: e.target.value }))} placeholder="e.g. 03ABCDE1234F1Z5" style={{ ...ZI, maxWidth: 300 }} />
            </div>

            {/* Billing Address */}
            <div style={ROW}>
              <span style={LB()}>Billing Address</span>
              <textarea value={invForm.customer_address} onChange={e => setInvForm((f: any) => ({ ...f, customer_address: e.target.value }))} rows={2} placeholder="Street, City, State, PIN" style={{ ...ZI, flex: 1, resize: "vertical" }} />
            </div>

            {/* Place of Supply */}
            <div style={{ ...ROW, borderBottom: "none", paddingBottom: 14 }}>
              <span style={LB()}>Place of Supply</span>
              <input value={invForm.customer_place_of_supply} onChange={e => setInvForm((f: any) => ({ ...f, customer_place_of_supply: e.target.value }))} placeholder="e.g. Maharashtra (27)" style={{ ...ZI, maxWidth: 260 }} />
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 -20px 0" }} />

            {/* Invoice # */}
            <div style={{ ...ROW, paddingTop: 14 }}>
              <span style={LB(true)}>Invoice # <span style={{ color: "#dc2626" }}>*</span></span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input value={invForm.invoice_no_override} onChange={e => setInvForm((f: any) => ({ ...f, invoice_no_override: e.target.value }))} placeholder="Auto-generated on save" style={{ ...ZI, maxWidth: 260 }} />
                <button title="Invoice number settings" style={{ width: 34, height: 34, border: "1px solid #e5e7eb", background: "#f9fafb", borderRadius: 6, cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                  <i className="ti ti-settings" />
                </button>
              </div>
            </div>

            {/* Order Number */}
            <div style={ROW}>
              <span style={LB()}>Order Number</span>
              <input value={invForm.order_number} onChange={e => setInvForm((f: any) => ({ ...f, order_number: e.target.value }))} placeholder="e.g. PO-2024-001" style={{ ...ZI, maxWidth: 260 }} />
            </div>

            {/* Invoice Date / Terms / Due Date */}
            <div style={ROW}>
              <span style={LB(true)}>Invoice Date <span style={{ color: "#dc2626" }}>*</span></span>
              <div style={{ flex: 1, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={invForm.invoice_date} onChange={e => setInvForm((f: any) => ({ ...f, invoice_date: e.target.value }))} style={{ ...ZI, width: 160 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Terms</span>
                  <select value={invForm.terms} onChange={e => setInvForm((f: any) => ({ ...f, terms: e.target.value }))} style={{ ...ZI, width: 180, cursor: "pointer" }}>
                    {["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60", "Custom"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Due Date</span>
                  <input type="date" value={invForm.due_date} onChange={e => setInvForm((f: any) => ({ ...f, due_date: e.target.value }))} style={{ ...ZI, width: 160 }} />
                </div>
              </div>
            </div>

            {/* Salesperson */}
            <div style={ROW}>
              <span style={LB()}>Salesperson</span>
              <input value={invForm.salesperson} onChange={e => setInvForm((f: any) => ({ ...f, salesperson: e.target.value }))} placeholder="Select or add salesperson" style={{ ...ZI, maxWidth: 300 }} />
            </div>

            {/* Subject — no border on last row */}
            <div style={{ display: "flex", alignItems: "flex-start", padding: "10px 0 14px" }}>
              <span style={LB()}>Subject</span>
              <textarea value={invForm.subject} onChange={e => setInvForm((f: any) => ({ ...f, subject: e.target.value }))} rows={2} placeholder="Let your customer know what this Invoice is for" style={{ ...ZI, flex: 1, resize: "vertical" }} />
            </div>
          </div>

          {/* ── Card 2: Item table ── */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 24, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>

            {/* Table toolbar */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #e5e7eb", background: "#fafafa", gap: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>Line Items</span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                <div onClick={() => setInvForm((f: any) => ({ ...f, apply_gst: !f.apply_gst }))} style={{ width: 36, height: 20, borderRadius: 10, background: invForm.apply_gst ? "#16a34a" : "#d1d5db", cursor: "pointer", position: "relative", transition: "background .15s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: invForm.apply_gst ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </div>
                Apply GST
              </label>
              {invForm.apply_gst && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Rate:</span>
                  <input type="number" value={invForm.gst_rate} onChange={e => setInvForm((f: any) => ({ ...f, gst_rate: e.target.value }))} style={{ width: 52, border: "1px solid #d1d5db", borderRadius: 4, padding: "3px 7px", fontSize: 13, outline: "none", textAlign: "center", fontFamily: "inherit" }} />
                  <span style={{ fontSize: 12, color: "#6b7280" }}>%</span>
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "center", width: 44, borderRight: "1px solid #e5e7eb" }}>#</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "left", borderRight: "1px solid #e5e7eb" }}>Item Details</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "center", width: 110, borderRight: "1px solid #e5e7eb" }}>Quantity</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "right", width: 140, borderRight: "1px solid #e5e7eb" }}>Rate</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "center", width: 160, borderRight: "1px solid #e5e7eb" }}>Tax</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "right", width: 130 }}>Amount</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {invItems.map((item, idx) => (
                    <tr key={item._id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 13, color: "#9ca3af", verticalAlign: "middle" }}>{idx + 1}</td>
                      <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                        <input value={item.description} onChange={e => setInvItems(items => items.map(i => i._id === item._id ? { ...i, description: e.target.value } : i))} placeholder="Type or click to select an item" style={{ border: "none", outline: "none", width: "100%", fontSize: 13, color: "#111827", background: "transparent", fontFamily: "inherit" }} />
                        <input value={item.sac} onChange={e => setInvItems(items => items.map(i => i._id === item._id ? { ...i, sac: e.target.value } : i))} placeholder="SAC Code" style={{ border: "none", outline: "none", fontSize: 11, color: "#9ca3af", width: "100%", background: "transparent", fontFamily: "inherit", display: "block", marginTop: 2 }} />
                      </td>
                      <td style={{ padding: "8px 8px", verticalAlign: "middle" }}>
                        <input type="number" value={item.qty} onChange={e => setInvItems(items => items.map(i => i._id === item._id ? { ...i, qty: e.target.value } : i))} style={{ border: "1px solid #e5e7eb", borderRadius: 4, padding: "6px 8px", fontSize: 13, width: "100%", textAlign: "center", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                      </td>
                      <td style={{ padding: "8px 8px", verticalAlign: "middle" }}>
                        <input type="number" value={item.rate} onChange={e => setInvItems(items => items.map(i => i._id === item._id ? { ...i, rate: e.target.value } : i))} placeholder="0.00" style={{ border: "1px solid #e5e7eb", borderRadius: 4, padding: "6px 8px", fontSize: 13, width: "100%", textAlign: "right", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "center", verticalAlign: "middle" }}>
                        {invForm.apply_gst ? (
                          <span style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap" }}>CGST+SGST ({invForm.gst_rate}%+{invForm.gst_rate}%)</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>No Tax</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: 14, color: "#111827", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>
                        {fmt((parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0))}
                      </td>
                      <td style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                        <button onClick={() => setInvItems(items => items.filter(i => i._id !== item._id))} disabled={invItems.length === 1} style={{ width: 28, height: 28, border: "none", background: "none", cursor: invItems.length === 1 ? "not-allowed" : "pointer", color: "#d1d5db", opacity: invItems.length === 1 ? .3 : 1, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <i className="ti ti-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add row buttons + totals panel */}
            <div style={{ display: "flex", gap: 20, padding: "16px 20px", borderTop: "1px solid #f3f4f6", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
                <button onClick={() => setInvItems(items => [...items, emptyItem()])} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  <i className="ti ti-plus" style={{ fontSize: 13 }} /> Add New Row
                </button>
                <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  <i className="ti ti-table-import" style={{ fontSize: 13 }} /> Add Items in Bulk
                </button>
              </div>

              {/* Totals */}
              <div style={{ marginLeft: "auto", width: 320, flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <span style={{ color: "#374151" }}>Sub Total</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(totals.subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <span style={{ color: "#374151" }}>Discount</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" value={invForm.discount} min="0" max="100" onChange={e => setInvForm((f: any) => ({ ...f, discount: e.target.value }))} style={{ width: 58, border: "1px solid #d1d5db", borderRadius: 4, padding: "4px 6px", fontSize: 13, textAlign: "right", outline: "none", fontFamily: "inherit" }} />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>%</span>
                    {totals.discountAmt > 0 && <span style={{ fontSize: 12, color: "#ef4444" }}>−{fmt(totals.discountAmt)}</span>}
                  </div>
                </div>
                {invForm.apply_gst && <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                    <span style={{ color: "#374151" }}>CGST ({invForm.gst_rate}%)</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(totals.cgstAmt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                    <span style={{ color: "#374151" }}>SGST ({invForm.gst_rate}%)</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(totals.sgstAmt)}</span>
                  </div>
                </>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <span style={{ color: "#374151" }}>Adjustment</span>
                  <input type="number" value={invForm.adjustment} onChange={e => setInvForm((f: any) => ({ ...f, adjustment: e.target.value }))} style={{ width: 90, border: "1px solid #d1d5db", borderRadius: 4, padding: "4px 6px", fontSize: 13, textAlign: "right", outline: "none", fontFamily: "inherit" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <span style={{ color: "#374151" }}>Round Off</span>
                  <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>{totals.roundOff >= 0 ? "+" : ""}{fmt(Math.abs(totals.roundOff))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "2px solid #111827", marginTop: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Total (₹)</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "#111827", fontVariantNumeric: "tabular-nums" }}>₹{fmt(totals.total)}</span>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>{numToWords(totals.total)}</div>
              </div>
            </div>
          </div>

          {/* ── Card 3: Notes + T&C ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Customer Notes</div>
              <textarea value={invForm.customer_notes} onChange={e => setInvForm((f: any) => ({ ...f, customer_notes: e.target.value }))} rows={4} placeholder="Thanks for your business." style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#374151", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: "1.5" }} />
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Terms &amp; Conditions</div>
              <textarea value={invForm.notes} onChange={e => setInvForm((f: any) => ({ ...f, notes: e.target.value }))} rows={4} placeholder={"1. Payment Made for this invoice should be through Bank Transfer Only.\n2. Payment Should be cleared within Due Date.\n3. This is a Monthly Plan Invoice"} style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#374151", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: "1.5" }} />
            </div>
          </div>

          {/* ── Card 4: Attach Files ── */}
          <div style={{ background: "#fff", border: "2px dashed #d1d5db", borderRadius: 10, padding: "28px 20px", marginBottom: 24, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <i className="ti ti-cloud-upload" style={{ fontSize: 28, color: "#d1d5db" }} />
            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 8, fontWeight: 500 }}>Attach File(s) to Invoice</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>You can upload a maximum of 5 files, 5MB each</div>
          </div>
        </div>

        {/* Fixed bottom action bar */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, zIndex: 10000, boxShadow: "0 -2px 8px rgba(0,0,0,.06)", flexWrap: "wrap" }}>
          <button onClick={() => saveInvoice("draft")} disabled={saving || !invForm.customer_name} style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#374151", cursor: saving || !invForm.customer_name ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14, opacity: !invForm.customer_name ? .5 : 1 }}>
            {saving ? "Saving…" : "Save as Draft"}
          </button>
          <button onClick={() => saveInvoice("sent")} disabled={saving || !invForm.customer_name} style={{ padding: "10px 22px", border: "none", borderRadius: 6, background: !invForm.customer_name ? "#9ca3af" : "#16a34a", color: "#fff", cursor: saving || !invForm.customer_name ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, opacity: !invForm.customer_name ? .5 : 1 }}>
            {saving ? "Saving…" : editId ? "Update Invoice" : "Save and Send"}
          </button>
          <button onClick={() => setShowForm(false)} style={{ padding: "10px 20px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14 }}>
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>Total Qty: <strong style={{ color: "#111827" }}>{totalQty.toFixed(2)}</strong></span>
          <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>Total Amount: <strong style={{ color: "#111827", fontSize: 16 }}>₹{fmt(totals.total)}</strong></span>
        </div>
      </div>,
      document.body
    );
  }

  // ── List / Customers view ─────────────────────────────────────────────────
  return (
    <div>
      {/* Sub tab bar */}
      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.02)", padding: 4, borderRadius: 10, border: "1px solid var(--border)", marginBottom: 20, width: "fit-content" }}>
        {([["list", "ti-file-invoice", "Invoices"], ["customers", "ti-users", "Customers"]] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: activeTab === key ? "rgba(255,255,255,0.08)" : "transparent", color: activeTab === key ? "var(--text)" : "var(--text3)" }}>
            <i className={`ti ${icon}`} style={{ fontSize: 14 }} /> {label}
            {key === "list" && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "1px 6px", color: "var(--text3)" }}>{invoices.length}</span>}
          </button>
        ))}
      </div>

      {activeTab === "list" ? (
        <>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Collected (Paid)", val: totalPaid, color: "var(--green)", icon: "ti-circle-check" },
              { label: "Pending Collection", val: totalPending, color: "#60a5fa", icon: "ti-clock-hour-4" },
              { label: "Total Invoiced", val: invoices.reduce((a, b) => a + b.total, 0), color: "var(--text2)", icon: "ti-file-invoice" },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>₹{fmt(s.val)}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions + filter */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", fontSize: 14, pointerEvents: "none" }} />
                <input value={searchInv} onChange={e => setSearchInv(e.target.value)} placeholder="Search…" style={{ background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 14px 8px 32px", color: "#fff", fontFamily: "inherit", fontSize: 13, outline: "none", width: 200 }} />
              </div>
              {["All", "Draft", "Sent", "Paid", "Overdue"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid", fontFamily: "inherit", borderColor: filterStatus === s ? "var(--accent)" : "var(--border2)", background: filterStatus === s ? "var(--accent-bg)" : "transparent", color: filterStatus === s ? "var(--accent2)" : "var(--text3)" }}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={openCreate} className="btn-primary" style={{ padding: "10px 18px", fontSize: 14 }}>
              <i className="ti ti-plus" /> New Invoice
            </button>
          </div>

          {/* Invoice table */}
          <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
            <table className="crm-table" style={{ width: "100%" }}>
              <thead>
                <tr>{["Invoice #", "Customer", "Date", "Due Date", "Amount", "Status", "Actions"].map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredInv.map(inv => {
                  const ss = STATUS_STYLE[inv.status] || STATUS_STYLE.draft;
                  const isOverdue = inv.status === "sent" && inv.due_date && new Date(inv.due_date) < new Date();
                  const displayStatus = isOverdue ? "overdue" : inv.status;
                  const ds = STATUS_STYLE[displayStatus];
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{inv.invoice_no}</td>
                      <td style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{inv.customer_name}</td>
                      <td style={{ fontSize: 13, color: "var(--text3)" }}>{new Date(inv.invoice_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td style={{ fontSize: 13, color: isOverdue ? "#f87171" : "var(--text3)", fontWeight: isOverdue ? 600 : 400 }}>{inv.due_date ? new Date(inv.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                      <td style={{ fontWeight: 800, fontSize: 15, color: inv.status === "paid" ? "var(--green)" : "var(--text)" }}>₹{fmt(inv.total)}</td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: ds.bg, color: ds.color, border: `1px solid ${ds.border}`, textTransform: "capitalize" }}>
                          {displayStatus}
                        </span>
                        {inv.status === "paid" && inv.payment_date && (
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>
                            {new Date(inv.payment_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {inv.payment_account}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {inv.status !== "paid" && (
                            <button onClick={() => { setMarkPaidModal(inv); setPaidForm({ date: todayStr(), account: "Current Account" }); }} title="Mark as Paid" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, padding: "6px 10px", color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              <i className="ti ti-check" /> Paid
                            </button>
                          )}
                          <button onClick={() => handlePrint(inv, companySettings || DEFAULT_COMPANY)} title="Download PDF" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 8, padding: "6px 10px", color: "#60a5fa", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                            <i className="ti ti-download" /> PDF
                          </button>
                          {inv.status !== "paid" && (
                            <button onClick={() => openEdit(inv)} title="Edit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}>
                              <i className="ti ti-pencil" />
                            </button>
                          )}
                          <button onClick={() => setDeleteConfirm(inv.id)} title="Delete" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>
                            <i className="ti ti-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredInv.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                <i className="ti ti-file-invoice" style={{ fontSize: 40, opacity: .2 }} />
                <div style={{ marginTop: 12, fontSize: 15 }}>{invoices.length === 0 ? "No invoices yet" : "No results"}</div>
                {invoices.length === 0 && <button onClick={openCreate} className="btn-primary" style={{ marginTop: 14, padding: "10px 20px", fontSize: 14 }}><i className="ti ti-plus" /> Create First Invoice</button>}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Customers Tab ── */
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>
              <i className="ti ti-refresh" style={{ marginRight: 5 }} />
              Auto-synced from Clients · Edit GSTIN &amp; billing details per customer below
            </div>
          </div>
          <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
            <table className="crm-table" style={{ width: "100%" }}>
              <thead>
                <tr>{["Customer", "GSTIN", "Billing Address", "Place of Supply", "Actions"].map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{c.name}</div>
                      {c.email && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{c.email}</div>}
                    </td>
                    <td>
                      {c.gstin ? (
                        <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, padding: "3px 10px" }}>{c.gstin}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text3)" }}>— not set</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text2)", maxWidth: 220, whiteSpace: "pre-wrap" }}>{c.billing_address || c.address || "—"}</td>
                    <td style={{ fontSize: 13, color: "var(--text3)" }}>{c.place_of_supply || ""}</td>
                    <td>
                      <button onClick={() => { setEditCustomer(c); setCustForm({ gstin: c.gstin || "", billing_address: c.billing_address || c.address || "", place_of_supply: c.place_of_supply || "" }); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 12px", color: "var(--blue)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
                        <i className="ti ti-pencil" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                <i className="ti ti-users" style={{ fontSize: 40, opacity: .2 }} />
                <div style={{ marginTop: 12, fontSize: 15 }}>No clients yet — add clients in the Clients section</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Mark as Paid Modal ── */}
      {markPaidModal && (
        <div onClick={() => setMarkPaidModal(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 420, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Mark as Paid</div>
              <button onClick={() => setMarkPaidModal(null)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: "12px 16px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>{markPaidModal.invoice_no} — {markPaidModal.customer_name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", marginTop: 4 }}>₹{fmt(markPaidModal.total)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LS}>Payment Received Date</label>
                <input type="date" value={paidForm.date} onChange={e => setPaidForm(f => ({ ...f, date: e.target.value }))} style={IS} />
              </div>
              <div>
                <label style={LS}>Received in Account</label>
                <select value={paidForm.account} onChange={e => setPaidForm(f => ({ ...f, account: e.target.value }))} style={IS}>
                  {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ padding: "10px 14px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, fontSize: 12, color: "#93c5fd" }}>
                <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
                This will automatically add an income entry of ₹{fmt(markPaidModal.total)} to Finance → {paidForm.account}.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setMarkPaidModal(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 13 }}>Cancel</button>
              <button onClick={markAsPaid} disabled={paidSaving} style={{ flex: 2, padding: 13, background: paidSaving ? "rgba(74,222,128,0.4)" : "rgba(74,222,128,0.85)", border: "none", borderRadius: 10, color: "#000", cursor: paidSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15 }}>
                {paidSaving ? "Marking…" : "Confirm Payment Received"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Customer GSTIN Modal ── */}
      {editCustomer && (
        <div onClick={() => setEditCustomer(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 440, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{editCustomer.name}</div>
              <button onClick={() => setEditCustomer(null)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LS}>GSTIN <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — for GST invoices only)</span></label>
                <input value={custForm.gstin} onChange={e => setCustForm((f: any) => ({ ...f, gstin: e.target.value }))} placeholder="e.g. 03AVKPB7465K2ZE" style={IS} />
              </div>
              <div>
                <label style={LS}>Billing Address</label>
                <textarea value={custForm.billing_address} onChange={e => setCustForm((f: any) => ({ ...f, billing_address: e.target.value }))} rows={3} placeholder="Street, City, State, PIN" style={{ ...IS, resize: "vertical" }} />
              </div>
              <div>
                <label style={LS}>Place of Supply</label>
                <input value={custForm.place_of_supply} onChange={e => setCustForm((f: any) => ({ ...f, place_of_supply: e.target.value }))} placeholder="e.g. Maharashtra (27)" style={IS} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditCustomer(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 13 }}>Cancel</button>
              <button onClick={saveCustomerGSTIN} disabled={custSaving} className="btn-primary" style={{ flex: 2, justifyContent: "center", padding: 13, fontSize: 14 }}>
                {custSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 380, maxWidth: "95vw", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Invoice?</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 24 }}>This cannot be undone. Paid invoices cannot be deleted.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11 }}>Cancel</button>
              <button onClick={() => deleteInvoice(deleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
