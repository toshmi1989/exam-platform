<template>
  <div class="guest-select">
    <h1>🧪 Пройти один тест</h1>
    <p class="subtitle">Разовый доступ — одна попытка прохождения теста</p>

    <h2>Выберите способ оплаты</h2>

    <div class="list">
      <button class="pay-btn" @click="pay('click')" :disabled="loading">Оплатить через Click</button>
      <button class="pay-btn" @click="pay('payme')" :disabled="loading">Оплатить через Payme</button>
      <button class="pay-btn" @click="pay('uzum')" :disabled="loading">Оплатить через Uzum</button>
      <button class="pay-btn" @click="pay('xazna')" :disabled="loading">Оплатить через Xazna</button>
      <button class="pay-btn" @click="pay('anorbank')" :disabled="loading">Оплатить через Anorbank</button>
      <button class="pay-btn" @click="pay('alif')" :disabled="loading">Оплатить через Alif</button>
    </div>

    <div v-if="loading" class="loading">⏳ Подготавливаем оплату...</div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "GuestSelect",
  data() {
    return {
      loading: false,
    };
  },
  methods: {
    async pay(ps) {
      if (this.loading) return;
      this.loading = true;

      try {
        const res = await axios.post(`/guest/pay/${ps}`, {}, { withCredentials: true });

        const url = res.data?.checkout_url;
        const invoiceId = res.data?.invoice_id;

        if (!url || !invoiceId) throw new Error("payment_failed");

        // ✅ сохраняем invoice для мобилы
        localStorage.setItem("last_guest_invoice", invoiceId);

        // ✅ переводим на экран ожидания (там будет авто-проверка + кнопка)
        this.$router.push({
          name: "GuestWait",
          query: { invoice: invoiceId, checkout: url },
        });

        // ✅ и сразу открываем оплату
        window.location.href = url;
      } catch (e) {
        alert(e?.response?.data?.error || "payment_failed");
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.guest-select {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 18px;
  text-align: center;
}
.subtitle {
  opacity: 0.75;
  margin-bottom: 18px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
}
.pay-btn {
  padding: 14px 18px;
  border-radius: 14px;
  border: 2px solid #d6e6f3;
  background: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.pay-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.loading {
  margin-top: 18px;
  font-size: 14px;
  opacity: 0.8;
}
</style>
