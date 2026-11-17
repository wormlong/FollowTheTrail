import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Compass, Navigation, User } from 'lucide-react-native';
import { DiscoverScreen, SimpleTrailGuide } from '../screens/DiscoverScreen';
import { MeScreen } from '../screens/MeScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { OutdoorColors } from '../theme/tokens';

const Tab = createBottomTabNavigator();

export const RootNavigator: React.FC = () => {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? OutdoorColors.dark : OutdoorColors.light;
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null);
  const [referenceGuide, setReferenceGuide] = useState<SimpleTrailGuide | null>(null);

  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Record"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            height: 58,
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            paddingBottom: 6,
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        }}
      >
        <Tab.Screen
          name="Discover"
          options={{
            title: '发现',
            tabBarIcon: ({ color }) => <Compass size={20} color={color} />,
          }}
        >
          {({ navigation }) => (
            <DiscoverScreen
              onOpenOnMap={(guide) => {
                setReferenceGuide(guide);
                navigation.navigate('Record');
              }}
            />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Record"
          options={{
            title: '记录',
            tabBarIcon: ({ focused }) => (
              <View
                style={[
                  styles.centerRecordButton,
                  {
                    backgroundColor: theme.primary,
                    borderColor: focused ? theme.accent : theme.surface,
                  },
                ]}
              >
                <Navigation size={15} color="#FFFFFF" />
              </View>
            ),
          }}
        >
          {({ navigation }) => (
            <RecordScreen
              referenceGuide={referenceGuide}
              onClearReferenceGuide={() => setReferenceGuide(null)}
              onViewCompletedTrack={(trackId) => {
                setHighlightedTrackId(trackId);
                navigation.navigate('Me');
              }}
            />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Me"
          options={{
            title: '我的',
            tabBarIcon: ({ color }) => <User size={20} color={color} />,
          }}
        >
          {() => <MeScreen highlightedTrackId={highlightedTrackId} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  centerRecordButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
