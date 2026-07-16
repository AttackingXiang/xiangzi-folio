import { Heart, X } from "@phosphor-icons/react";
import { useRef } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";

const paypalUrl = "https://www.paypal.com/ncp/payment/Q3YKYE86YKBPJ";

export function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef, onClose);
  if (!open) return null;

  return <div className="modal-backdrop support-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="modal support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-dialog-title">
      <header>
        <span className="modal__icon"><Heart weight="fill" /></span>
        <div><small>SUPPORT XIANGZI FOLIO</small><h2 id="support-dialog-title">支持开发者</h2></div>
        <button className="icon-button" type="button" aria-label="关闭支持开发者" title="关闭" onClick={onClose}><X /></button>
      </header>
      <p className="support-dialog__intro">如果 Xiangzi Folio 为你节省了时间，欢迎自愿支持项目持续更新。</p>
      <div className="support-dialog__options">
        <article><h3>支付宝</h3><div className="support-qr support-qr--alipay"><img src="support/alipay-support.jpg" alt="支付宝支持二维码" /></div><p>使用支付宝扫码支持</p></article>
        <article><h3>微信支付</h3><div className="support-qr support-qr--wechat"><img src="support/wechat-support.jpg" alt="微信支付支持二维码" /></div><p>使用微信扫码支持</p></article>
        <article><h3>PayPal</h3><img className="support-paypal-qr" src="support/paypal-support.png" alt="PayPal 支持二维码" /><a className="button button--ghost" href={paypalUrl} target="_blank" rel="noreferrer">打开 PayPal</a></article>
      </div>
      <p className="support-dialog__note">支持完全自愿，不影响任何功能使用；扫码或打开 PayPal 后，将由相应支付平台处理。</p>
    </section>
  </div>;
}
