import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQueue } from '../hooks/useQueue';

const TrackingPage = ({ route }: any) => {
  const { ticketId, ticketNumber } = route.params;
  const { status, loading, error } = useQueue(ticketId);

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Số thứ tự của bạn</Text>
      <Text style={styles.ticketNumber}>{ticketNumber}</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Số hiện tại đang gọi</Text>
        <Text style={styles.currentNumber}>{status?.currentNumber || '...'}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {status ? `Còn khoảng ${status.position - 1} người trước bạn` : 'Đang tải thông tin...'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 18, color: '#666', marginBottom: 10 },
  ticketNumber: { fontSize: 64, fontWeight: 'bold', color: '#0068ff', marginBottom: 40 },
  statusBox: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    width: '100%',
    elevation: 4,
    marginBottom: 20,
  },
  statusLabel: { fontSize: 16, color: '#888', marginBottom: 10 },
  currentNumber: { fontSize: 48, fontWeight: 'bold', color: '#333' },
  infoBox: { alignItems: 'center' },
  infoText: { fontSize: 16, color: '#444', fontStyle: 'italic' },
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
});

export default TrackingPage;
