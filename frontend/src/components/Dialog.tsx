import React, { useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface DialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  type?: 'alert' | 'confirm' | 'prompt' | 'success' | 'custom';
  promptPlaceholder?: string;
  onClose: () => void;
  onConfirm?: (value?: string) => void;
  children?: React.ReactNode;
}

export default function Dialog({
  isOpen,
  title,
  message,
  type = 'alert',
  promptPlaceholder = '',
  onClose,
  onConfirm,
  children
}: DialogProps) {
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(type === 'prompt' ? inputValue : undefined);
    }
    setInputValue('');
    if (type === 'alert' || type === 'success') {
      onClose(); // Auto close on OK for alert and success
    }
  };

  const handleClose = () => {
    setInputValue('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className={`bg-white rounded-lg shadow-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${type === 'custom' ? 'max-w-2xl' : 'max-w-sm'}`}>
        <div className={`px-4 py-3 border-b border-gray-100 flex items-center gap-2 ${
          type === 'alert' ? 'bg-red-50 text-red-700' : 
          type === 'success' ? 'bg-green-50 text-green-800' :
          'bg-gray-50 text-gray-900'
        }`}>
          {type === 'alert' ? <AlertTriangle className="h-5 w-5 text-red-500" /> : 
           type === 'success' ? <CheckCircle className="h-5 w-5 text-green-600" /> :
           <Info className="h-5 w-5 text-[#0051c3]" />}
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={handleClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        
        <div className={type === 'custom' ? 'p-6' : 'p-4 text-sm text-gray-700'}>
          {type === 'custom' ? (
            children
          ) : (
            <>
              {message && <div className="mb-4" dangerouslySetInnerHTML={{ __html: message }} />}
              
              {type === 'prompt' && (
                <input
                  type="text"
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={promptPlaceholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0051c3]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') handleClose();
                  }}
                />
              )}
            </>
          )}
        </div>

        {type !== 'custom' && (
          <div className="px-4 py-3 bg-gray-50 flex justify-end gap-2 border-t border-gray-100">
            {(type === 'confirm' || type === 'prompt') && (
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`px-3 py-1.5 text-sm font-medium text-white rounded shadow-sm ${
                type === 'alert' ? 'bg-red-600 hover:bg-red-700' : 
                type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                'bg-[#0051c3] hover:bg-[#003682]'
              }`}
            >
              {(type === 'alert' || type === 'success') ? 'Okay' : 'Confirm'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
