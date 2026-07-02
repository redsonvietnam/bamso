import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { servicesApi, ticketsApi } from '../api/client';

const ServiceSelection = ({ navigation }: any) => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadServices() {
      try {
        const data = await servicesApi.getAll();
        setServices(data);
      } catch (err) {
        console.error('Failed to load services', err);
      } finally {
        setLoading(false);
      }
    }
    loadServices();
  }, []);

  const handleTakeTicket = async (serviceId: string) => {
    try {
      // Simple identity for demo purposes
      const ticket = await ticketsApi.create(serviceId, 'Khách Zalo', '0000000000');
      navigation.navigate('Tracking', { ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
    } catch (err) {
      alert('Lỗi khi lấy số. Vui lòng thử lại!');
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chọn Dịch Vụ</Text>
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.serviceItem} onPress={() => handleTakeTicket(item.id)}>
            <Text style={styles.serviceName}>{item.name}</Text>
            <Text style={styles.takeButton}>Lấy Số →</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
  serviceItem: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
  },
  serviceName: { fontSize: 18, fontWeight: '500', color: '#444' },
  takeButton: { color: '#0068ff', fontWeight: 'bold', fontSize: 16 },
});

export default ServiceSelection;
