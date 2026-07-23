import { Heart, X } from "@phosphor-icons/react";
import { useRef } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { createTranslator } from "../lib/i18n";
import type { Language } from "../types";

const paypalUrl = "https://www.paypal.com/ncp/payment/Q3YKYE86YKBPJ";

export function SupportDialog({ open, language, onClose }: { open: boolean; language: Language; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const t = createTranslator(language);
  useDialogFocus(open, dialogRef, onClose);
  if (!open) return null;

  return <div className="modal-backdrop support-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="modal support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-dialog-title">
      <header>
        <span className="modal__icon"><Heart weight="fill" /></span>
        <div><small>SUPPORT XIANGZI FOLIO</small><h2 id="support-dialog-title">{t("support.title")}</h2></div>
        <button className="icon-button" type="button" aria-label={t("support.close")} title={t("common.close")} onClick={onClose}><X /></button>
      </header>
      <p className="support-dialog__intro">{t("support.intro")}</p>
      <div className="support-dialog__options">
        <article><h3>{t("support.alipay")}</h3><div className="support-qr support-qr--alipay"><img src="support/alipay-support.jpg" alt={t("support.alipayAlt")} /></div><p>{t("support.scanAlipay")}</p></article>
        <article><h3>{t("support.wechat")}</h3><div className="support-qr support-qr--wechat"><img src="support/wechat-support.jpg" alt={t("support.wechatAlt")} /></div><p>{t("support.scanWechat")}</p></article>
        <article><h3>PayPal</h3><img className="support-paypal-qr" src="support/paypal-support.png" alt={t("support.paypalAlt")} /><a className="button button--ghost" href={paypalUrl} target="_blank" rel="noreferrer">{t("support.openPaypal")}</a></article>
      </div>
      <p className="support-dialog__note">{t("support.note")}</p>
    </section>
  </div>;
}
