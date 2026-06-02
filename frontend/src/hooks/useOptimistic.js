import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/useToast'

/**
 * useOptimistic hook
 * Implements optimistic UI pattern - update UI immediately, rollback on error
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.onSuccess - Callback on successful API call
 * @param {Function} options.onError - Callback on API error
 * @returns {Object} - { execute, pending, error, reset }
 */
export function useOptimistic({ onSuccess, onError } = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const { error: showError, success } = useToast()

  const execute = useCallback(
    async (updateFn, rollbackFn, apiCall) => {
      // Store previous state for potential rollback
      let previousState = null
      setError(null)

      try {
        // Apply optimistic update
        previousState = updateFn()

        // Set pending state
        setPending(true)

        // Make API call
        await apiCall()

        // Call success callback if provided
        if (onSuccess) {
          onSuccess()
        }
      } catch (err) {
        // Rollback on error
        if (rollbackFn && previousState !== null) {
          rollbackFn(previousState)
        }

        // Set error state
        const message = err.response?.data?.message || 'Operation failed'
        setError(message)

        // Show error toast
        showError(message)

        // Call error callback if provided
        if (onError) {
          onError(err)
        }
      } finally {
        setPending(false)
      }
    },
    [onSuccess, onError, showError]
  )

  const reset = useCallback(() => {
    setError(null)
  }, [])

  return { execute, pending, error, reset }
}

/**
 * useOptimisticList hook
 * Optimistic updates for list operations (add, update, delete)
 *
 * @param {Array} initialData - Initial list data
 * @returns {Object} - { items, add, update, remove, pending }
 */
export function useOptimisticList(initialData = []) {
  const [items, setItems] = useState(initialData)
  const [pending, setPending] = useState(false)
  const { error: showError } = useToast()

  const add = useCallback(async (newItem, apiCall) => {
    let previousItems
    setPending(true)

    try {
      // Optimistically add item
      previousItems = [...items]
      const tempId = `temp-${Date.now()}`
      setItems((prev) => [...prev, { ...newItem, id: tempId }])

      // Make API call
      const { data } = await apiCall()

      // Replace temp item with real item from server
      setItems((prev) =>
        prev.map((item) => (item.id === tempId ? data.item || newItem : item))
      )

      return data
    } catch (err) {
      // Rollback
      setItems(previousItems)
      showError(err.response?.data?.message || 'Failed to add item')
      throw err
    } finally {
      setPending(false)
    }
  }, [items, showError])

  const update = useCallback(async (id, updates, apiCall) => {
    let previousItems
    setPending(true)

    try {
      // Optimistically update item
      previousItems = [...items]
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      )

      // Make API call
      const { data } = await apiCall()

      // Update with server response
      if (data.item) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? data.item : item))
        )
      }

      return data
    } catch (err) {
      // Rollback
      setItems(previousItems)
      showError(err.response?.data?.message || 'Failed to update item')
      throw err
    } finally {
      setPending(false)
    }
  }, [items, showError])

  const remove = useCallback(async (id, apiCall) => {
    let previousItems
    setPending(true)

    try {
      // Optimistically remove item
      previousItems = [...items]
      setItems((prev) => prev.filter((item) => item.id !== id))

      // Make API call
      await apiCall()
    } catch (err) {
      // Rollback
      setItems(previousItems)
      showError(err.response?.data?.message || 'Failed to remove item')
      throw err
    } finally {
      setPending(false)
    }
  }, [items, showError])

  return { items, setItems, add, update, remove, pending }
}

/**
 * useToggleOptimistic hook
 * Optimistic toggle for boolean states (e.g., voting open/close)
 *
 * @param {boolean} initialValue - Initial toggle value
 * @returns {Object} - { value, toggle, pending }
 */
export function useToggleOptimistic(initialValue = false) {
  const [value, setValue] = useState(initialValue)
  const [pending, setPending] = useState(false)
  const { error: showError } = useToast()

  const toggle = useCallback(async (apiCall) => {
    // Store previous value
    const previousValue = value
    setPending(true)

    try {
      // Optimistically toggle
      setValue((prev) => !prev)

      // Make API call
      await apiCall()
    } catch (err) {
      // Rollback
      setValue(previousValue)
      showError(err.response?.data?.message || 'Operation failed')
      throw err
    } finally {
      setPending(false)
    }
  }, [value, showError])

  return { value, toggle, pending, setValue }
}

export default useOptimistic