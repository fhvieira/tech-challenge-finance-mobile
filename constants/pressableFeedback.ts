import { StyleSheet } from "react-native";

export function getPressedFeedbackStyle(pressed: boolean) {
  return pressed ? styles.pressed : null;
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
