// @paystack/inline-js ships no type declarations. We only use a small surface:
// resume a server-initialized transaction via its access code and get the
// reference back on success.
declare module "@paystack/inline-js" {
  interface ResumeCallbacks {
    onSuccess?: (transaction: { reference: string; [k: string]: any }) => void;
    onCancel?: () => void;
    onError?: (error: any) => void;
    onLoad?: (response: any) => void;
  }

  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: ResumeCallbacks): void;
    newTransaction(options: Record<string, any>): void;
  }
}
