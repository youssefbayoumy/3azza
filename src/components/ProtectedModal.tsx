import React, { useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
  type ModalProps,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { canAccessProtectedContent } from '../utils/appLock';

type ProtectedModalProps = Omit<ModalProps, 'onRequestClose'> & {
  accessibilityLabel: string;
  onRequestClose: () => void;
};

/**
 * Keeps protected form state mounted while ensuring native modal windows cannot
 * appear above the app-lock screen after the app enters the background.
 */
export default function ProtectedModal({
  accessibilityLabel,
  children,
  onRequestClose,
  visible,
  ...props
}: ProtectedModalProps) {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const appLockEnabled = useAppStore((state) => state.appLockEnabled);
  const initialFocusRef = useRef<View>(null);

  const handleShow = () => {
    requestAnimationFrame(() => {
      const reactTag = findNodeHandle(initialFocusRef.current);
      if (reactTag !== null) AccessibilityInfo.setAccessibilityFocus(reactTag);
    });
  };

  return (
    <Modal
      {...props}
      onRequestClose={onRequestClose}
      onShow={handleShow}
      statusBarTranslucent
      visible={canAccessProtectedContent(appLockEnabled, isAuthenticated) && (visible ?? true)}
    >
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalRoot}
      >
        <View
          ref={initialFocusRef}
          accessible
          accessibilityRole="header"
          accessibilityLabel={accessibilityLabel}
          style={styles.focusTarget}
        />
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  focusTarget: {
    height: 1,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
