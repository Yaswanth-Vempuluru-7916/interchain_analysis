import { useState, useEffect, type FormEvent } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Define interfaces for API data
interface DurationData {
  total_orders: number;
  avg_user_init_duration: number | null;
  avg_cobi_init_duration: number | null;
  avg_user_redeem_duration: number | null;
  avg_cobi_redeem_duration: number | null;
  avg_user_refund_duration: number | null;
  avg_cobi_refund_duration: number | null;
}

interface Order {
  create_order_id: string;
  created_at: string;
  durations: {
    user_init_duration: number | null;
    cobi_init_duration: number | null;
    user_redeem_duration: number | null;
    cobi_redeem_duration: number | null;
    user_refund_duration: number | null;
    cobi_refund_duration: number | null;
    overall_duration: number | null;
  };
}

interface AveragesResponse {
  message: string;
  last_updated: string;
  averages: Record<string, DurationData>;
}

interface OrdersResponse {
  message: string;
  orders: Record<string, Order[]>;
}

const App = () => {
  // State for date inputs and API data
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [averagesData, setAveragesData] = useState<AveragesResponse['averages'] | null>(null);
  const [ordersData, setOrdersData] = useState<OrdersResponse['orders'] | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [error, setError] = useState('');

  // Fetch data from backend
  const fetchData = async () => {
    // Validate dates
    const isValidDate = (date: Date | null) => date === null || !isNaN(date.getTime());
    if ((startTime && !isValidDate(startTime)) || (endTime && !isValidDate(endTime))) {
      setError('Invalid date format');
      return;
    }

    try {
      const averagesResponse = await axios.post<AveragesResponse>('http://localhost:3000/averages', {
        start_time: startTime ? startTime.toISOString() : undefined,
        end_time: endTime ? endTime.toISOString() : undefined,
      });
      const ordersResponse = await axios.post<OrdersResponse>('http://localhost:3000/orders/all', {
        start_time: startTime ? startTime.toISOString() : undefined,
        end_time: endTime ? endTime.toISOString() : undefined,
      });

      setAveragesData(averagesResponse.data.averages);
      setOrdersData(ordersResponse.data.orders);
      setLastUpdated(averagesResponse.data.last_updated);
      setError('');
    } catch (err) {
      setError('Failed to fetch data from backend');
      console.error(err);
    }
  };

  // Fetch data on mount (default 30 days)
  useEffect(() => {
    fetchData();
  }, []);

  // Handle form submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  // Format duration to hours, minutes, or seconds
  const formatDecimal = (value: number | null): string => {
    if (value === null) return 'N/A';
    if (value > 3600) {
      const hours = value / 3600;
      return `${hours.toFixed(2)}hr`;
    } else if (value > 60) {
      const minutes = value / 60;
      return `${minutes.toFixed(2)}min`;
    }
    return `${value.toFixed(2)}s`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header with Date Inputs and Last Updated */}
      <div className="max-w-7xl mx-auto mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Swap Order Durations</h1>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 items-center mb-4">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">Start Date</label>
            <DatePicker
              selected={startTime}
              onChange={(date: Date | null) => setStartTime(date || new Date())}
              showTimeSelect
              dateFormat="yyyy-MM-dd HH:mm"
              timeFormat="HH:mm"
              timeIntervals={15}
              className="border rounded p-2 text-sm w-full"
              placeholderText="Select start date and time"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">End Date</label>
            <DatePicker
              selected={endTime}
              onChange={(date: Date | null) => setEndTime(date || new Date())}
              showTimeSelect
              dateFormat="yyyy-MM-dd HH:mm"
              timeFormat="HH:mm"
              timeIntervals={15}
              className="border rounded p-2 text-sm w-full"
              placeholderText="Select end date and time"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">Last Updated</label>
            <span className="border rounded p-2 text-sm bg-gray-200">
              {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'N/A'}
            </span>
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600 invisible">Submit</label>
            <button
              type="submit"
              className="bg-blue-500 text-white rounded p-2 text-sm hover:bg-blue-600"
            >
              Fetch Data
            </button>
          </div>
        </form>
        {error && (
          <div className="text-red-600 text-sm mb-4">{error}</div>
        )}
      </div>

      {/* Average Durations Table */}
      <div className="max-w-7xl mx-auto mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Average Durations</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-200">
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Chain Pair</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Total Orders</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">User Init</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Cobi Init</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">User Redeem</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Cobi Redeem</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">User Refund</th>
                <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Cobi Refund</th>
              </tr>
            </thead>
            <tbody>
              {averagesData && Object.keys(averagesData).map((chainPair) => (
                <tr key={chainPair} className="hover:bg-gray-50">
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{chainPair}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{averagesData[chainPair].total_orders}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(averagesData[chainPair].avg_user_init_duration)}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(averagesData[chainPair].avg_cobi_init_duration)}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(averagesData[chainPair].avg_user_redeem_duration)}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(averagesData[chainPair].avg_cobi_redeem_duration)}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(averagesData[chainPair].avg_user_refund_duration)}</td>
                  <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(averagesData[chainPair].avg_cobi_refund_duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!averagesData && !error && (
          <div className="text-gray-600 text-sm mt-4">Loading average durations...</div>
        )}
      </div>

      {/* Individual Orders Section */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Individual Orders</h2>
        {ordersData && Object.keys(ordersData).map((chainPair) => (
          <div key={chainPair} className="mb-6">
            <details className="border rounded bg-white">
              <summary className="py-2 px-4 bg-gray-200 cursor-pointer font-medium text-gray-800">
                {chainPair} ({ordersData[chainPair].length} orders)
              </summary>
              <div className="p-4">
                {ordersData[chainPair].length === 0 ? (
                  <p className="text-gray-600 text-sm">No orders found for this chain pair.</p>
                ) : (
                  <table className="min-w-full bg-white border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Order ID</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Created At</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">User Init</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Cobi Init</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">User Redeem</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Cobi Redeem</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">User Refund</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Cobi Refund</th>
                        <th className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersData[chainPair].map((order: Order) => (
                        <tr key={order.create_order_id} className="hover:bg-gray-50">
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{order.create_order_id}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">
                            {new Date(order.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.user_init_duration)}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.cobi_init_duration)}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.user_redeem_duration)}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.cobi_redeem_duration)}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.user_refund_duration)}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.cobi_refund_duration)}</td>
                          <td className="py-2 px-4 border-b text-sm text-gray-800">{formatDecimal(order.durations.overall_duration)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          </div>
        ))}
        {!ordersData && !error && (
          <div className="text-gray-600 text-sm mt-4">Loading individual orders...</div>
        )}
      </div>
    </div>
  );
};

export default App;