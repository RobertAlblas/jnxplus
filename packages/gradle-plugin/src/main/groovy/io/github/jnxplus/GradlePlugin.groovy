/*
 * This Groovy source file was generated by the Gradle 'init' task.
 */
package io.github.jnxplus


import org.gradle.api.Plugin
import org.gradle.api.Project

/**
 * Jnxplus plugin.
 * */
class GradlePlugin implements Plugin<Project> {

  void apply(Project project) {
    // Register a task
    project.tasks.register("projectDependencyReport", ProjectDependencyTask)
  }

}