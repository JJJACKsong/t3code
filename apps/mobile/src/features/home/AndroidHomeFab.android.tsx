import { useRef, useState, type ComponentProps } from "react";
import {
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollComposeButton } from "../../components/ScrollComposeButton.android";
import {
  androidHomeFabPosition,
  type AndroidHomeFabLayout as SharedAndroidHomeFabLayout,
} from "./AndroidHomeFab.shared";
import { useWorkspaceState } from "../../state/workspace";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useGT } from "gt-react-native";
import { adjacentHomeEnvironment, homeListFilterEnvironments } from "./home-list-filter-menu";
import { useHomeListOptions } from "./home-list-options";
import { HomeEnvironmentSwipeContext } from "./thread-swipe-actions";
import { FabScrollContext } from "./FabScrollContext";
import { updateFabScroll } from "./fab-scroll";
import { useAndroidControlSizing } from "../../components/ui/useAndroidControlSizing";
import { WorkspaceTabsContext, useWorkspaceTabs } from "../layout/workspace/WorkspaceTabsContext";
import { FLOATING_TABS, floatingTabsMetrics } from "../layout/workspace/floating-workspace-tabs";
import { useEnabledNavigationTabs } from "../layout/workspace/navigation-tabs";
import {
  useAppearancePreferences,
  useAndroidFloatingTabs,
} from "../settings/appearance/AppearancePreferencesProvider";

export function AndroidHomeFabLayout(props: ComponentProps<typeof SharedAndroidHomeFabLayout>) {
  const floatingTabsEnabled = useAndroidFloatingTabs();
  const insets = useSafeAreaInsets();
  const { appearance } = useAppearancePreferences();
  const { fontScale } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null);
  const { state, environments } = useWorkspaceState();
  const gt = useGT();
  const choices = homeListFilterEnvironments(environments);
  const { options, setSelectedEnvironmentId } = useHomeListOptions(
    new Set(choices.map((choice) => choice.environmentId)),
  );
  const selected = choices.find((choice) => choice.environmentId === options.selectedEnvironmentId);
  const advance = (step: 1 | -1) => {
    setSelectedEnvironmentId(adjacentHomeEnvironment(choices, options.selectedEnvironmentId, step));
  };
  const swipeEnabled = !props.disabled && choices.length > 0;
  const gesture = usePanGesture({
    enabled: swipeEnabled,
    runOnJS: true,
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    maxPointers: 1,
    onDeactivate: (event) => {
      if (
        !event.canceled &&
        Math.abs(event.translationX) >= 52 &&
        Math.abs(event.translationX) > Math.abs(event.translationY) * 1.5
      ) {
        advance(event.translationX < 0 ? 1 : -1);
      }
    },
  });
  const [expanded, setExpanded] = useState(true);
  const { scale, fabSize } = useAndroidControlSizing();
  const enabledTabs = useEnabledNavigationTabs();
  const barWidth =
    layoutWidth === null
      ? undefined
      : layoutWidth - (Math.max(insets.left, FLOATING_TABS.edge) - FLOATING_TABS.edge);
  const size = floatingTabsEnabled
    ? floatingTabsMetrics(enabledTabs.length + 1, scale, fabSize, barWidth).height
    : fabSize;
  const workspace = useWorkspaceTabs();
  const bottomClearance = insets.bottom + FLOATING_TABS.bottom + FLOATING_TABS.edge + size;
  const context = floatingTabsEnabled && workspace ? { ...workspace, bottomClearance } : workspace;
  const scrollState = useRef({ anchor: 0, expanded: true });
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const next = updateFabScroll(
      scrollState.current,
      contentOffset.y,
      contentSize.height - layoutMeasurement.height,
    );
    if (next.expanded !== scrollState.current.expanded) setExpanded(next.expanded);
    scrollState.current = next;
  };

  // Remount only the FAB when its font or pane changes to clear the cached expanded width.
  // Floating navigation shares this row; Material split views put New thread in the rail.
  return (
    <View className="flex-1" onLayout={(event) => setLayoutWidth(event.nativeEvent.layout.width)}>
      <WorkspaceTabsContext value={context}>
        <HomeEnvironmentSwipeContext value={swipeEnabled}>
          <GestureDetector gesture={gesture}>
            <View collapsable={false} className="flex-1">
              <FabScrollContext value={onScroll}>{props.children}</FabScrollContext>
            </View>
          </GestureDetector>
        </HomeEnvironmentSwipeContext>
      </WorkspaceTabsContext>
      {!props.disabled &&
      (!props.sidebar || floatingTabsEnabled) &&
      state.hasConnections &&
      layoutWidth !== null ? (
        <ScrollComposeButton
          key={`${appearance.baseFontSize}:${fontScale}:${layoutWidth}`}
          environmentLabel={selected?.label ?? gt("All environments")}
          onEnvironmentPress={() => advance(1)}
          environmentAbove={floatingTabsEnabled}
          size={size}
          expanded={floatingTabsEnabled ? false : expanded}
          onPress={props.onStartNewTask}
          className="absolute"
          style={
            floatingTabsEnabled
              ? {
                  right: FLOATING_TABS.edge,
                  bottom: insets.bottom + FLOATING_TABS.bottom,
                }
              : androidHomeFabPosition(insets.bottom, props.sidebar)
          }
        />
      ) : null}
    </View>
  );
}
