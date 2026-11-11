'use client';

import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Lock, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

export type AlertType = 'info' | 'success' | 'error' | 'warning' | 'login_required';

export interface AlertModalState {
  isOpen: boolean;
  type: AlertType;
  title: string;
  message: string | React.ReactNode;
  onConfirm?: () => void | Promise<void>;
  showCancel?: boolean;
  confirmText?: string;
  confirmLoadingText?: string;
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
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const alertStateRef = useRef(alertState);

  useEffect(() => {
    alertStateRef.current = alertState;
    // Si la alerta cambia o se cierra desde afuera, resetear loading
    if (!alertState.isOpen) {
      setIsConfirmLoading(false);
    }
  }, [alertState]);

  if (!alertState.isOpen) return null;

  const {
    type,
    title,
    message,
    onConfirm,
    showCancel,
    confirmText,
    confirmLoadingText,
    cancelText,
    cancelButtonClassName,
    confirmButtonClassName,
    confirmOnLeft,
  } = alertState;

  const handleConfirm = async () => {
    if (isConfirmLoading) return;
    const initialAlert = alertState;
    if (onConfirm) {
      setIsConfirmLoading(true);
      try {
        await onConfirm();
      } catch (err) {
        console.error('Error on alert confirm:', err);
      } finally {
        setIsConfirmLoading(false);
      }
      // Si el componente padre no cambió la alerta (por ejemplo a error o nuevo estado),
      // y sigue abierta, cerrarla limpiamente
      if (alertStateRef.current === initialAlert) {
        onClose();
      }
    } else {
      onClose();
    }
  };

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

  const renderConfirmContent = () => {
    if (isConfirmLoading) {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <span>{confirmLoadingText || 'Bloqueando y continuando...'}</span>
        </span>
      );
    }
    return confirmText || 'Aceptar';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4 text-center transform animate-scale-up">
        <button
          type="button"
          onClick={onClose}
          disabled={isConfirmLoading}
          className={`absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors ${
            isConfirmLoading ? 'opacity-30 pointer-events-none' : ''
          }`}
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
                  onClick={handleConfirm}
                  disabled={isConfirmLoading}
                  className={confirmButtonClassName || "btn-primary flex-1"}
                >
                  {renderConfirmContent()}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isConfirmLoading}
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
                  disabled={isConfirmLoading}
                  className={cancelButtonClassName || "btn-primary bg-secondary text-foreground hover:bg-border flex-1"}
                >
                  {cancelText || 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isConfirmLoading}
                  className={confirmButtonClassName || "btn-primary flex-1"}
                >
                  {renderConfirmContent()}
                </button>
              </>
            )
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirmLoading}
              className="btn-primary w-full"
            >
              {renderConfirmContent()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
