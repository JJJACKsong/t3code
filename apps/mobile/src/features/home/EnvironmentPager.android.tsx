import { useState } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { environmentPageSnap } from "./environment-page-snap";
import type { EnvironmentPagerProps } from "./EnvironmentPager.shared";
import { adjacentHomeEnvironment } from "./home-list-filter-menu";

export function EnvironmentPager(props: EnvironmentPagerProps) {
  const [width, setWidth] = useState(0);
  return (
    <View
      className="flex-1 overflow-hidden"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && props.environments.length > 0 ? (
        <PageStrip
          key={JSON.stringify([
            width,
            props.selected,
            ...props.environments.map((e) => e.environmentId),
          ])}
          {...props}
          width={width}
        />
      ) : (
        props.children(props.selected, true)
      )}
    </View>
  );
}

function PageStrip({ width, ...props }: EnvironmentPagerProps & { readonly width: number }) {
  const previous = adjacentHomeEnvironment(props.environments, props.selected, -1);
  const next = adjacentHomeEnvironment(props.environments, props.selected, 1);
  const offset = useSharedValue(0);
  const settling = useSharedValue(false);
  const select = props.onChange;
  const gesture = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    maxPointers: 1,
    onActivate: () => {
      if (!settling.value) cancelAnimation(offset);
    },
    onUpdate: (event) => {
      if (!settling.value) offset.value = Math.max(-width, Math.min(width, event.translationX));
    },
    onDeactivate: (event) => {
      if (settling.value) return;
      const x = offset.value;
      const target = environmentPageSnap(x, event.velocityX, width, event.canceled);
      settling.value = target !== 0;
      offset.value = withTiming(target, { duration: 180 }, (finished) => {
        if (finished && target !== 0) runOnJS(select)(target < 0 ? next : previous);
      });
    },
  });
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View
          style={[
            { position: "absolute", top: 0, bottom: 0, left: -width, width: 3 * width },
            motion,
          ]}
        >
          {[previous, props.selected, next].map((id, index) => (
            <View
              key={index}
              pointerEvents={index === 1 ? "auto" : "none"}
              importantForAccessibility={index === 1 ? "auto" : "no-hide-descendants"}
              style={{ position: "absolute", top: 0, bottom: 0, left: index * width, width }}
            >
              {props.children(id, index === 1)}
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
