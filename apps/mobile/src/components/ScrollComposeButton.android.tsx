import { AppText } from "./ui/AppText";
import { NativeThemeHost } from "./ui/NativeThemeHost.android";
import { Box, ExtendedFloatingActionButton, Icon, Text } from "@expo/ui/jetpack-compose";
import {
  defaultMinSize,
  fillMaxWidth,
  height,
  onSizeChanged,
  size,
} from "@expo/ui/jetpack-compose/modifiers";
import { useGT } from "gt-react-native";
import { useState } from "react";
import { I18nManager, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useAndroidControlSizing } from "./ui/useAndroidControlSizing";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { resolveScaledTextRole } from "../lib/appearancePreferences";

/** Keep the animated width and icon positioning entirely inside Compose, not Yoga. */
export function ScrollComposeButton(props: {
  readonly expanded: boolean;
  readonly environmentLabel?: string;
  readonly onEnvironmentPress?: () => void;
  readonly environmentAbove?: boolean;
  readonly onPress: () => void;
  readonly size?: number;
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const gt = useGT();
  const { appearance, themeVariables: colors } = useAppearancePreferences();
  const typography = resolveScaledTextRole("footnote", appearance.baseFontSize);
  const { iconSize, fabSize: scaledFabSize } = useAndroidControlSizing();
  const fabSize = props.size ?? scaledFabSize;
  const nativeSize = Math.max(56, fabSize);
  const scale = fabSize / nativeSize;
  const nativeIconSize = Math.round(iconSize / scale);
  const [buttonWidth, setButtonWidth] = useState(nativeSize);
  const rememberWidth = ({ width }: { width: number }) => {
    setButtonWidth((previous) => Math.max(previous, width));
  };
  return (
    <View
      pointerEvents="box-none"
      className={props.className}
      style={[props.style, { left: 20, height: fabSize }]}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={{
          transform: [{ scale }],
          transformOrigin: I18nManager.isRTL ? "top left" : "top right",
        }}
      >
        <NativeThemeHost
          matchContents={{ vertical: true }}
          ignoreSafeAreaKeyboardInsets
          style={{ width: "100%" }}
        >
          <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
            <ExtendedFloatingActionButton
              expanded={props.expanded}
              containerColor={colors["--color-primary"]}
              modifiers={[
                defaultMinSize({ minWidth: nativeSize }),
                height(nativeSize),
                onSizeChanged(rememberWidth),
              ]}
            >
              <ExtendedFloatingActionButton.Icon>
                <Box modifiers={[size(nativeIconSize, nativeIconSize)]}>
                  <Icon
                    source={require("../../assets/icons/compose.xml")}
                    size={nativeIconSize}
                    tint={colors["--color-primary-foreground"]}
                  />
                </Box>
              </ExtendedFloatingActionButton.Icon>
              <ExtendedFloatingActionButton.Text>
                <Text
                  color={colors["--color-primary-foreground"]}
                  style={{
                    fontSize: typography.fontSize / scale,
                    lineHeight: typography.lineHeight / scale,
                    fontWeight: "500",
                  }}
                >
                  {gt("New thread")}
                </Text>
              </ExtendedFloatingActionButton.Text>
            </ExtendedFloatingActionButton>
          </Box>
        </NativeThemeHost>
      </View>
      {props.environmentLabel !== undefined && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: props.environmentAbove
              ? 0
              : (props.expanded ? buttonWidth * scale : fabSize) + 8,
            bottom: props.environmentAbove ? fabSize + 8 : 0,
            alignItems: "flex-end",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.environmentLabel}
            onPress={props.onEnvironmentPress}
            android_ripple={{ foreground: true }}
            style={{
              height: fabSize,
              maxWidth: "100%",
              justifyContent: "center",
              paddingHorizontal: 14,
              backgroundColor: colors["--color-primary"],
              borderRadius: 16 * scale,
              overflow: "hidden",
            }}
          >
            <AppText
              numberOfLines={1}
              style={{
                color: colors["--color-primary-foreground"],
                fontSize: typography.fontSize,
                fontWeight: "500",
              }}
            >
              {props.environmentLabel}
            </AppText>
          </Pressable>
        </View>
      )}
      {/* The visual host is wider than the button; only this target intercepts list touches. */}
      <Pressable
        onPress={props.onPress}
        accessibilityRole="button"
        accessibilityLabel={gt("New thread")}
        android_ripple={{ foreground: true }}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: props.expanded ? buttonWidth * scale : fabSize,
          borderRadius: 16 * scale,
          overflow: "hidden",
        }}
      />
    </View>
  );
}
