'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

export const IFrame: React.FC<
  React.IframeHTMLAttributes<unknown> & {
    setInnerRef?: (ref: HTMLIFrameElement | undefined) => void;
    appendStyles?: boolean;
    theme?: 'light' | 'dark';
    transparent?: boolean;
  }
> = ({ children, setInnerRef, ...props }) => {
  const [ref, setRef] = useState<HTMLIFrameElement | null>();
  const doc = ref?.contentWindow?.document as Document;
  const mountNode = doc?.body;

  return (
    <iframe
      {...props}
      ref={(ref) => {
        if (ref) {
          setRef(ref);

          if (setInnerRef) {
            setInnerRef(ref);
          }
        }
      }}
    >
      {mountNode ? createPortal(children, mountNode) : null}
    </iframe>
  );
};
