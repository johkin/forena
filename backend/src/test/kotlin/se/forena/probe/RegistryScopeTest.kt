package se.forena.probe

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.verify
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.modulith.events.core.EventPublicationRepository
import org.springframework.modulith.events.core.PublicationTargetIdentifier
import org.springframework.modulith.events.core.TargetEventPublication
import se.forena.probe.delivery.internal.RegistryReadScope
import se.forena.probe.delivery.internal.ScopedPublicationRepository
import java.util.concurrent.CompletableFuture

class RegistryScopeTest {
    @Test
    fun `read scope preserves vendor claims and failure transitions including rejected concurrent claim`() {
        val delegate = mock(EventPublicationRepository::class.java)
        val repository = ScopedPublicationRepository(delegate)
        val id = java.util.UUID.randomUUID()
        val now = java.time.Instant.now()
        `when`(delegate.markResubmitted(id, now)).thenReturn(false)
        RegistryReadScope.withPublication(emptyList()) {
            assertThat(repository.markResubmitted(id, now)).isFalse()
            repository.markProcessing(id)
            repository.markFailed(id)
        }
        verify(delegate).markResubmitted(id, now)
        verify(delegate).markProcessing(id)
        verify(delegate).markFailed(id)
    }

    @Test
    fun `scope is restored after exception and is not inherited by another thread`() {
        val delegate = mock(EventPublicationRepository::class.java)
        val unrelated = TargetEventPublication.of("unrelated", PublicationTargetIdentifier.of("other"))
        `when`(delegate.findIncompletePublications()).thenReturn(listOf(unrelated))
        val repository = ScopedPublicationRepository(delegate)
        assertThatThrownBy {
            RegistryReadScope.withPublication(emptyList()) {
                assertThat(repository.findIncompletePublications()).isEmpty()
                assertThat(CompletableFuture.supplyAsync { repository.findIncompletePublications() }.get())
                    .containsExactly(unrelated)
                error("deliberate failure")
            }
        }.isInstanceOf(IllegalStateException::class.java)
        assertThat(repository.findIncompletePublications()).containsExactly(unrelated)
    }

    @Test
    fun `nested read scope cannot overwrite its caller`() {
        RegistryReadScope.withPublication(emptyList()) {
            assertThatThrownBy { RegistryReadScope.withPublication(emptyList()) { error("unreachable") } }
                .isInstanceOf(IllegalStateException::class.java)
            assertThat(RegistryReadScope.publications()).isEmpty()
        }
        assertThat(RegistryReadScope.publications()).isNull()
    }
}
