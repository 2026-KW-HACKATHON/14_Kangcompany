import { slot, request, store } from './mock-api'
export const isSupabaseConfigured = true
export const supabase = {
  rpc: async () => ({
    data: { order_id: 'LOCAL-ORDER', amount: 100000, order_name: '예약금' },
    error: null,
  }),
  from: (table: string) => {
    const chain: any = {}
    for (const k of [
      'select',
      'eq',
      'order',
      'gte',
      'lte',
      'in',
      'limit',
      'maybeSingle',
      'single',
    ])
      chain[k] = () => chain
    chain.then = (resolve: any) =>
      Promise.resolve({
        data: table === 'slots' ? slot : table === 'requests' ? request : store,
        error: null,
      }).then(resolve)
    return chain
  },
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
}
