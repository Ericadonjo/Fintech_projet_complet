import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Text } from 'react-native';
import { Colors, Radius } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import NewTransactionScreen from '../screens/NewTransactionScreen';
import AccountsScreen from '../screens/AccountsScreen';
import ReportsScreen from '../screens/ReportsScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Tab icons mirroring the web sidebar navigation
const TAB_ICONS: Record<string, [string, string]> = {
  Dashboard:    ['home',          'home-outline'],
  Transactions: ['receipt',       'receipt-outline'],
  Accounts:     ['wallet',        'wallet-outline'],
  Reports:      ['bar-chart',     'bar-chart-outline'],
  Categories:   ['pricetags',     'pricetags-outline'],
  Settings:     ['settings',      'settings-outline'],
};

interface MainTabsProps { onLogout: () => void; }

function MainTabs({ onLogout }: MainTabsProps) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.g800, // sidebar background color
          borderTopColor: 'rgba(255,255,255,0.1)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.a400,    // matches sidebar active amber
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ color, focused }) => {
          const [active, inactive] = TAB_ICONS[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard"    component={DashboardScreen}    options={{ tabBarLabel: 'Accueil'      }} />
      <Tab.Screen name="Transactions" component={TransactionsScreen}  options={{ tabBarLabel: 'Transactions' }} />
      <Tab.Screen name="Accounts"     component={AccountsScreen}      options={{ tabBarLabel: 'Comptes'      }} />
      <Tab.Screen name="Reports"      component={ReportsScreen}       options={{ tabBarLabel: 'Rapports'     }} />
      <Tab.Screen name="Categories"   component={CategoriesScreen}    options={{ tabBarLabel: 'Catégories'   }} />
      <Tab.Screen
        name="Settings"
        options={{ tabBarLabel: 'Paramètres' }}
      >
        {() => <SettingsScreen onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

interface Props { onLogout: () => void; }

export default function AppNavigator({ onLogout }: Props) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main">
          {() => <MainTabs onLogout={onLogout} />}
        </Stack.Screen>
        <Stack.Screen
          name="NewTransaction"
          component={NewTransactionScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
