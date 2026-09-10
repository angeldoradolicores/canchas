'use client';

import { CheckCircle2, AlertTriangle, XCircle, Info, Lock, X } from 'lucide-react';
import Link from 'next/link';

export type AlertType = 'info' | 'success' | 'error' | 'warning' | 'login_required';

export interface AlertModalState {
  isOpen: boolean;
  type: AlertType;
  title: string;
  message: string | React.ReactNode;
  onConfirm?: () => void;
  showCancel?: boolean;
  confirmText?: string;
  cancelText?: string;
  cancelButtonClassName?: string;
  confirmButtonClassName?: string;
  confirmOnLeft?: boolean;
}

interface CustomAlertModalProps {
  alertState: AlertModalState;
  onClose: () => void;
}

export function CustomAlertModal({ alertState, onClose }: CustomAlertModalProps) {
  if (!alertState.isOpen) return null;

  const { type, title, message, onConfirm, showCancel, confirmText, cancelText, cancelButtonClassName, confirmButtonClassName, confirmOnLeft } = alertState;

  const icons = {
    info: <Info className="text-blue-500" size={32} />,
    success: <CheckCircle2 className="text-green-500" size={32} />,
    error: <XCircle className="text-red-500" size={32} />,
    warning: <AlertTriangle className="text-amber-500" size={32} />,
    login_required: <Lock className="text-primary" size={32} />,
  };

  const badgeBgs = {
    info: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-amber-50 border-amber-200',
    login_required: 'bg-primary/10 border-primary/20',
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4 text-center transform animate-scale-up">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
        >
          <X size={18} />
        </button>

        <div className={`w-16 h-16 rounded-2xl border ${badgeBgs[type]} flex items-center justify-center mx-auto shadow-inner`}>
          {icons[type]}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h3>
          {typeof message === 'string' ? (
            <p className="text-sm text-muted-foreground leading-relaxed px-2 whitespace-pre-wrap">{message}</p>
          ) : (
            <div className="text-sm text-muted-foreground leading-relaxed px-2 text-left">{message}</div>
          )}
        </div>

        <div className="pt-2 flex gap-3">
          {type === 'login_required' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary bg-secondary text-foreground hover:bg-border flex-1"
              >
                Cancelar
              </button>
              <Link
                href="/login"
                onClick={onClose}
                className="btn-primary flex-1 text-center"
              >
                Iniciar Sesión
              </Link>
            </>
          ) : showCancel ? (
            confirmOnLeft ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onConfirm) onConfirm();
                  }}
                  className={confirmButtonClassName || "btn-primary flex-1"}
                >
                  {confirmText || 'Aceptar'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={cancelButtonClassName || "btn-primary bg-secondary text-foreground hover:bg-border flex-1"}
                >
                  {cancelText || 'Cancelar'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className={cancelButtonClassName || "btn-primary bg-secondary text-foreground hover:bg-border flex-1"}
                >
                  {cancelText || 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onConfirm) onConfirm();
                  }}
                  className={confirmButtonClassName || "btn-primary flex-1"}
                >
                  {confirmText || 'Aceptar'}
                </button>
              </>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onConfirm) onConfirm();
              }}
              className="btn-primary w-full"
            >
              {confirmText || 'Entendido'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
