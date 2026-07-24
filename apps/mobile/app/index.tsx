import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createApiClient, type HealthResponse } from "@newsroom/api-client";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function HomeScreen() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(API_BASE);
      setHealth(await client.health());
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.brand}>Newsroom</Text>
        <Text style={styles.lede}>
          Mobile shell. Feed and topics arrive in later features.
        </Text>
        <Text style={styles.meta}>API: {API_BASE}</Text>

        {loading ? <ActivityIndicator /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {health ? (
          <Text style={styles.meta}>
            Health: {health.status} · db {health.checks.database} · ollama{" "}
            {health.checks.ollama}
          </Text>
        ) : null}

        <Pressable style={styles.button} onPress={() => void loadHealth()}>
          <Text style={styles.buttonText}>Refresh health</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f0e8" },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  brand: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1c1917",
  },
  lede: {
    fontSize: 16,
    color: "#57534e",
    lineHeight: 22,
  },
  meta: {
    fontSize: 14,
    color: "#44403c",
  },
  error: {
    color: "#b91c1c",
  },
  button: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#0f766e",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: "#f8fffe",
    fontWeight: "600",
  },
});
