window.addEventListener('DOMContentLoaded', () => {
  try {
    publishData = function publishDataWithPost(nextState, message) {
      return requestJson('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: nextState, message })
      });
    };
  } catch (error) {
    console.error('Bibika publish hotfix', error);
  }
});
